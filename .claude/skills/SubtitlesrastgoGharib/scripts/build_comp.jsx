// Run via run_ae.ps1 (globals JOB_DIR, SKILL_DIR).
// Reads JOB_DIR/job.json, JOB_DIR/cues.json, SKILL_DIR/style.json.
// Builds the subtitle comp: per cue one text layer "SUB NN" (key words coloured) + "SUB NN BOX"
// (rounded box that auto-fits the text, soft drop shadow, parented to the text). Saves JOB_DIR/<aepName>.
// Animation + underline are added afterwards by animate.jsx.
(function () {
    var log = [];
    function L(s) { log.push(s); }
    function readJSON(p) { var f = new File(p); f.encoding = "UTF-8"; f.open("r"); var s = f.read(); f.close(); return eval("(" + s + ")"); }
    function hex(h) { h = h.replace("#", ""); return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255]; }
    try {
        var job = readJSON(JOB_DIR + "/job.json"), S = readJSON(SKILL_DIR + "/style.json"), cues = readJSON(JOB_DIR + "/cues.json");
        var aepFile = new File(JOB_DIR + "/" + job.aepName);

        // --- project: reuse ours / an empty untitled one, otherwise open a new one (never discard user work) ---
        var p = app.project;
        var ours = p.file && p.file.fsName === aepFile.fsName;
        if (!ours && !(p.file === null && p.numItems === 0)) {
            if (p.dirty) throw new Error("After Effects has another project with unsaved changes - ask the user to save/close it");
            if (aepFile.exists) app.open(aepFile); else app.newProject();
            p = app.project;
        }
        var fnt = app.fonts.getFontsByPostScriptName ? app.fonts.getFontsByPostScriptName(S.font) : null;
        if (fnt && fnt.length === 0) L("WARNING font " + S.font + " not found");

        app.beginUndoGroup("Build subtitles");
        for (var i = p.numItems; i >= 1; i--) if (p.item(i) instanceof CompItem && p.item(i).name === job.compName) p.item(i).remove();
        var comp = p.items.addComp(job.compName, job.width, job.height, 1, job.duration, job.fps);
        comp.bgColor = [0.2, 0.2, 0.2];
        var POS = [job.width * S.posX, job.height * S.posY];
        var FIXED = "Math.max(inPoint, outPoint - 2 * thisComp.frameDuration)";

        for (var c = 0; c < cues.length; c++) {
            var cue = cues[c], str = "", ranges = [];
            for (var k = 0; k < cue.words.length; k++) {
                if (k) str += " ";
                if (cue.words[k].key) ranges.push([str.length, str.length + cue.words[k].t.length]);
                str += cue.words[k].t;
            }
            var name = "SUB " + (c + 1 < 10 ? "0" : "") + (c + 1);
            var txt = comp.layers.addText(str); txt.name = name;
            var st = txt.property("ADBE Text Properties").property("ADBE Text Document");
            var td = st.value;
            td.resetCharStyle(); td.resetParagraphStyle();
            try { td.composerEngine = ComposerEngine.UNIVERSAL_TYPE_ENGINE; } catch (e) { L("composer: " + e); }
            try { td.direction = ParagraphDirection.DIRECTION_RIGHT_TO_LEFT; } catch (e) { L("direction: " + e); }
            td.font = S.font; td.fontSize = S.fontSize;
            td.applyFill = true; td.fillColor = hex(S.textColor); td.applyStroke = false;
            td.justification = ParagraphJustification.CENTER_JUSTIFY;
            st.setValue(td);
            if (ranges.length) {
                td = st.value;
                for (var r = 0; r < ranges.length; r++) td.characterRange(ranges[r][0], ranges[r][1]).fillColor = hex(S.keyColor);
                st.setValue(td);
            }
            txt.inPoint = cue.s; txt.outPoint = cue.e;
            var wdt = txt.sourceRectAtTime(cue.s, false).width;
            if (wdt > S.maxWidth) { td = st.value; td.fontSize = Math.floor(S.fontSize * S.maxWidth / wdt); st.setValue(td); L(name + " shrunk to " + td.fontSize); }
            var tr = txt.property("ADBE Transform Group");
            tr.property("ADBE Anchor Point").expression = "var r = sourceRectAtTime(" + FIXED + ", false);\n[r.left + r.width / 2, r.top + r.height / 2];";
            tr.property("ADBE Position").setValue(POS);

            var box = comp.layers.addShape(); box.name = name + " BOX";
            box.moveAfter(txt); box.inPoint = cue.s; box.outPoint = cue.e;
            var grp = box.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); grp.name = "Box";
            var rect = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
            var P = "var p = thisLayer.parent;\nvar r = p.sourceRectAtTime(Math.max(p.inPoint, p.outPoint - 2 * thisComp.frameDuration), false);\n";
            rect.property("ADBE Vector Rect Size").expression = P + "[r.width + " + (2 * S.padX) + ", r.height + " + (2 * S.padY) + "];";
            rect.property("ADBE Vector Rect Position").expression = P + "[r.left + r.width / 2, r.top + r.height / 2];";
            rect.property("ADBE Vector Rect Roundness").setValue(S.roundness);
            // NOTE: adding a sibling property invalidates earlier references (rect) - don't touch rect after this
            var fill = box.property("ADBE Root Vectors Group").property("Box").property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").setValue(hex(S.boxColor));
            fill.property("ADBE Vector Fill Opacity").setValue(S.boxOpacity);
            box.parent = txt;
            var btr = box.property("ADBE Transform Group");
            btr.property("ADBE Anchor Point").setValue([0, 0]);
            btr.property("ADBE Position").setValue([0, 0]);
            btr.property("ADBE Scale").setValue([100, 100]);
            btr.property("ADBE Opacity").expression = "thisLayer.parent.transform.opacity;";
            var ds = box.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
            ds.property("ADBE Drop Shadow-0001").setValue([0, 0, 0, 1]);
            ds.property("ADBE Drop Shadow-0002").setValue(S.shadow.opacity);
            ds.property("ADBE Drop Shadow-0003").setValue(S.shadow.direction);
            ds.property("ADBE Drop Shadow-0004").setValue(S.shadow.distance);
            ds.property("ADBE Drop Shadow-0005").setValue(S.shadow.softness);
        }
        app.endUndoGroup();
        p.save(aepFile);
        L("saved " + aepFile.fsName);
        L("OK cues=" + cues.length + " layers=" + comp.numLayers);
    } catch (err) {
        L("ERROR line " + err.line + ": " + err.toString());
        try { app.endUndoGroup(); } catch (e) {}
    }
    var o = new File(JOB_DIR + "/ae_log.txt"); o.encoding = "UTF-8"; o.open("w"); o.write(log.join("\n")); o.close();
})();
