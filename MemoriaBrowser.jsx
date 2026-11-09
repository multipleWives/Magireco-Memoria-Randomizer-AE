#target aftereffects
#targetengine "memoriaBrowser"

#include "MemoriaData.jsxinc"

(function memoriaBrowser(thisObj) {
    var SCRIPT_NAME = "Memoria Browser";
    var currentEntry = null;
    var currentLanguage = "en";
    var filtered = [];

    function languageLabel(code) {
        var labels = {
            jp: "Japanese",
            en: "English (Translated)",
            na: "English (Official)"
        };
        return labels[code] || code.toUpperCase();
    }

    function availableLanguages() {
        var found = {};
        var result = [];
        var i, key;
        for (i = 0; i < MEMORIA_DATA.length; i++) {
            for (key in MEMORIA_DATA[i].variants) {
                if (MEMORIA_DATA[i].variants.hasOwnProperty(key) && !found[key]) {
                    found[key] = true;
                    result.push(key);
                }
            }
        }
        result.sort(function (a, b) {
            var order = { jp: 0, en: 1, na: 2 };
            var aa = order.hasOwnProperty(a) ? order[a] : 99;
            var bb = order.hasOwnProperty(b) ? order[b] : 99;
            if (aa !== bb) return aa - bb;
            return a < b ? -1 : (a > b ? 1 : 0);
        });
        return result;
    }

    function rebuildFilter() {
        filtered = [];
        var i;
        for (i = 0; i < MEMORIA_DATA.length; i++) {
            if (MEMORIA_DATA[i].variants[currentLanguage]) filtered.push(i);
        }
    }

    function characterWidthUnits(text) {
        var units = 0;
        var i, code;
        for (i = 0; i < text.length; i++) {
            code = text.charCodeAt(i);
            if (text.charAt(i) === "\n" || text.charAt(i) === "\r") continue;
            if (text.charAt(i) === " ") units += 0.32;
            else if ((code >= 0x3000 && code <= 0x30FF) ||
                     (code >= 0x3400 && code <= 0x9FFF) ||
                     (code >= 0xFF00 && code <= 0xFFEF)) units += 1.0;
            else if (text.charAt(i).match(/[ilI1.,'`:;!|]/)) units += 0.30;
            else if (text.charAt(i).match(/[mwMW@%&]/)) units += 0.85;
            else units += 0.55;
        }
        return units;
    }

    function estimatedTextFits(text, fontSize, boxWidth, boxHeight) {
        var paragraphs = text.replace(/\r\n?/g, "\n").split("\n");
        var usableWidth = boxWidth * 0.92;
        var usableHeight = boxHeight * 0.92;
        var lineHeight = fontSize * 1.20;
        var lineCapacity = usableWidth / fontSize;
        var lines = 0;
        var i;
        for (i = 0; i < paragraphs.length; i++) {
            lines += Math.max(1, Math.ceil(characterWidthUnits(paragraphs[i]) / lineCapacity));
        }
        return lines * lineHeight <= usableHeight;
    }

    function applyTextStyle(sourceProp, text, fontSize) {
        var doc = sourceProp.value;
        doc.text = text;
        doc.fontSize = fontSize;
        doc.applyFill = true;
        doc.fillColor = [1, 1, 1];
        doc.applyStroke = false;
        doc.justification = ParagraphJustification.LEFT_JUSTIFY;
        doc.autoLeading = false;
        doc.leading = fontSize * 1.20;
        sourceProp.setValue(doc);
    }

    function layerTextFits(sourceProp, text, fontSize, boxWidth, boxHeight) {
        applyTextStyle(sourceProp, text, fontSize);
        var recomposed = sourceProp.value;
        try {
            if (typeof recomposed.boxOverflow !== "undefined") return !recomposed.boxOverflow;
        } catch (ignore) {
        }
        return estimatedTextFits(text, fontSize, boxWidth, boxHeight);
    }

    function fitTextLayer(layer, comp, text, boxWidth, boxHeight) {
        var sourceProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
        var minimumSize = Math.max(8, Math.round(comp.height * 0.012));
        var maximumSize = Math.max(minimumSize, Math.round(comp.height * 0.10));
        var low = minimumSize;
        var high = maximumSize;
        var best = minimumSize;
        var mid;

        while (low <= high) {
            mid = Math.floor((low + high) / 2);
            if (layerTextFits(sourceProp, text, mid, boxWidth, boxHeight)) {
                best = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        applyTextStyle(sourceProp, text, best);

        var fittedDoc = sourceProp.value;
        var boxPos = fittedDoc.boxTextPos;
        layer.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([
            boxPos[0] + boxWidth / 2,
            boxPos[1] + boxHeight / 2
        ]);
        layer.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);
    }

    function buildUI() {
        var panel = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        panel.orientation = "column";
        panel.alignChildren = ["fill", "top"];
        panel.spacing = 8;
        panel.margins = 12;

        var controls = panel.add("group");
        controls.orientation = "row";
        controls.alignChildren = ["left", "center"];
        controls.add("statictext", undefined, "Language:");

        var languageMenu = controls.add("dropdownlist");
        languageMenu.preferredSize.width = 170;
        var languages = availableLanguages();
        var defaultIndex = 0;
        var i;
        for (i = 0; i < languages.length; i++) {
            var item = languageMenu.add("item", languageLabel(languages[i]));
            item.languageCode = languages[i];
            if (languages[i] === "en") defaultIndex = i;
        }
        languageMenu.selection = defaultIndex;
        currentLanguage = languageMenu.selection.languageCode;
        rebuildFilter();

        var randomButton = controls.add("button", undefined, "Random Memoria");

        var sizeControls = panel.add("group");
        sizeControls.orientation = "row";
        sizeControls.alignChildren = ["left", "center"];
        sizeControls.add("statictext", undefined, "Text box:");
        sizeControls.add("statictext", undefined, "Width");
        var widthPercent = sizeControls.add("edittext", undefined, "66");
        widthPercent.characters = 4;
        sizeControls.add("statictext", undefined, "%");
        sizeControls.add("statictext", undefined, "Height");
        var heightPercent = sizeControls.add("edittext", undefined, "33");
        heightPercent.characters = 4;
        sizeControls.add("statictext", undefined, "%");

        function validatePercentField(field, fallback) {
            var normalized = field.text.replace(",", ".");
            var value = parseFloat(normalized);
            if (isNaN(value)) value = fallback;
            value = Math.max(1, Math.min(100, value));
            value = Math.round(value * 10) / 10;
            field.text = String(value);
            return value;
        }

        widthPercent.onChange = function () { validatePercentField(widthPercent, 66); };
        heightPercent.onChange = function () { validatePercentField(heightPercent, 33); };

        var titleText = panel.add("statictext", undefined, "Choose Random Memoria", { truncate: "middle" });
        titleText.alignment = ["fill", "top"];

        var metaText = panel.add("statictext", undefined, filtered.length + " entries available");
        metaText.alignment = ["fill", "top"];

        var preview = panel.add("edittext", undefined, "", { multiline: true, readonly: true, scrolling: true });
        preview.alignment = ["fill", "fill"];
        preview.preferredSize = [420, 280];

        var createButton = panel.add("button", undefined, "Create Text Layer");
        createButton.alignment = ["fill", "bottom"];
        createButton.enabled = false;

        var credit = panel.add("statictext", undefined, "Text: Magia Record English Wiki contributors (CC BY-SA)");
        credit.alignment = ["fill", "bottom"];

        function showEntry(entry) {
            currentEntry = entry;
            titleText.text = entry.title;
            metaText.text = languageLabel(currentLanguage) + "  •  " + filtered.length + " entries available";
            preview.text = entry.variants[currentLanguage] || "This language is not available for this Memoria.";
            createButton.enabled = !!entry.variants[currentLanguage];
        }

        function pickRandom() {
            if (!filtered.length) {
                currentEntry = null;
                titleText.text = "No matching entries";
                preview.text = "No Memoria descriptions are available in this language.";
                createButton.enabled = false;
                return;
            }
            var selectedIndex;
            if (filtered.length === 1) {
                selectedIndex = filtered[0];
            } else {
                do {
                    selectedIndex = filtered[Math.floor(Math.random() * filtered.length)];
                } while (currentEntry && MEMORIA_DATA[selectedIndex].title === currentEntry.title);
            }
            showEntry(MEMORIA_DATA[selectedIndex]);
        }

        languageMenu.onChange = function () {
            if (!languageMenu.selection) return;
            currentLanguage = languageMenu.selection.languageCode;
            rebuildFilter();
            if (currentEntry && currentEntry.variants[currentLanguage]) {
                showEntry(currentEntry);
            } else {
                pickRandom();
            }
        };

        randomButton.onClick = pickRandom;

        createButton.onClick = function () {
            if (!currentEntry || !currentEntry.variants[currentLanguage]) return;
            var comp = app.project && app.project.activeItem;
            if (!(comp instanceof CompItem)) {
                alert("Open or select a composition first.", SCRIPT_NAME);
                return;
            }

            app.beginUndoGroup("Create Memoria Text Layer");
            try {
                var text = currentEntry.variants[currentLanguage];
                var widthValue = validatePercentField(widthPercent, 66);
                var heightValue = validatePercentField(heightPercent, 33);
                var boxWidth = Math.max(1, Math.round(comp.width * widthValue / 100));
                var boxHeight = Math.max(1, Math.round(comp.height * heightValue / 100));
                var layer = comp.layers.addBoxText([boxWidth, boxHeight]);
                layer.name = currentEntry.title + " — " + languageLabel(currentLanguage);
                fitTextLayer(layer, comp, text, boxWidth, boxHeight);
                layer.selected = true;
            } catch (error) {
                alert("Could not create the text layer.\n\n" + error.toString(), SCRIPT_NAME);
            } finally {
                app.endUndoGroup();
            }
        };

        panel.onResizing = panel.onResize = function () { this.layout.resize(); };
        pickRandom();
        panel.layout.layout(true);
        return panel;
    }

    var ui = buildUI();
    if (ui instanceof Window) {
        ui.center();
        ui.show();
    }
})(this);
