# Magia Record Memoria Text Randomizer for AE

An After Effects ScriptUI panel for browsing random Memoria descriptions and creating the displayed description as a text layer.

## Features

- Japanese, translated English, and official English text where available
- Random browsing without immediately creating a layer
- Separate **Create Text Layer** action
- Left-aligned paragraph text with automatic font fitting
- Configurable text-box width and height, defaulting to 66% × 33% of the composition
- Offline dataset with 1,041 Memoria entries

## Install

1. Download `MemoriaBrowser-AE.zip` from the latest release.
2. Extract `MemoriaBrowser.jsx` and `MemoriaData.jsxinc` into After Effects' `Scripts/ScriptUI Panels` folder.
3. Restart After Effects.
4. Open **Window → Memoria Browser**.

To run without installing, keep both files together and choose **File → Scripts → Run Script File** in After Effects, then select `MemoriaBrowser.jsx`.

## Use

1. Choose a language.
2. Set the text-box width and height percentages if desired.
3. Click **Random Memoria** until you find an entry you want.
4. Open or select a composition.
5. Click **Create Text Layer**.

The generated text box is centered in the composition. Its font size is calculated to fit the selected text and box dimensions.

## Data

The bundled dataset was captured from the [Magia Record English Wiki Memoria List](https://magireco.fandom.com/wiki/Memoria_List) on August 13, 2026. Community-authored wiki text is available under CC BY-SA.

Run `node tools/build_memoria_data.js` to refresh `MemoriaData.jsxinc` from the public wiki API.
