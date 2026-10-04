// Run via run_ae.ps1 (globals JOB_DIR, SKILL_DIR). Re-runnable, and SAFE AFTER THE USER EDITED THE TEXT:
// it never changes text/colours. For every "SUB NN" layer of job.compName it
//  - adds/replaces "SUB NN LINE": underline (style.underline) that slides to the word being spoken
//  - sets the entrance: line rises + fades + scales, words cascade in (rise + blur), motion blur on
// Word times come from cues.json; if the user changed the word count of a line, times are spread over the line.
// Writes check PNGs JOB_DIR/check_*.png.
(function () {
    var log = [];
    function L(s) { log.push(s); }
    function readJSON(p) { var f = new File(p); f.encoding = "UTF-8"; f.open("r"); var s = f.read(); f.close(); return eval("(" + s + ")"); }
    function hex(h) { h = h.replace("#", ""); return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255]; }
    function ease(prop, k, inf) {
        var n = 1;
        try { var v = prop.keyValue(k); if (v instanceof Array && !prop.isSpatial) n = v.length; } catch (e) {}
        var a = []; for (var i = 0; i < n; i++) a.push(new KeyframeEase(0, inf));
        prop.setTemporalEaseAtKey(k, a, a);
    }
    function clearKeys(p) { while (p.numKeys > 0) p.removeKey(1); }
    try {
        var job = readJSON(JOB_DIR + "/job.json"), S = readJSON(SKILL_DIR + "/style.json"), cues = readJSON(JOB_DIR + "/cues.json");
        var U = S.underline, E = S.entrance;
        var proj = app.project, comp = null;
        for (var i = 1; i <= proj.numItems; i++) if (proj.item(i) instanceof CompItem && proj.item(i).name === job.compName) comp = proj.item(i);
        if (!comp) throw new Error("comp " + job.compName + " not found in the open project");
        app.beginUndoGroup("Subtitles: underline + animation");

        for (i = comp.numLayers; i >= 1; i--) if (/ LINE$/.test(comp.layer(i).name)) comp.layer(i).remove();
        comp.motionBlur = !!S.motionBlur;
        var FIXED = "Math.max(inPoint, outPoint - 2 * thisComp.frameDuration)";

        for (var c = 1; c <= cues.length; c++) {
            var name = "SUB " + (c < 10 ? "0" : "") + c;
            var txt = comp.layer(name), box = comp.layer(name + " BOX");
            if (!txt) { L("missing " + name); continue; }
            var st = txt.property("ADBE Text Properties").property("ADBE Text Document");
            var text = st.value.text;

            var words = [], re = /\S+/g, m;
            while ((m = re.exec(text)) !== null) words.push({ b: m.index + m[0].length, t: m[0] });
            if (!words.length) continue;
            var orig = cues[c - 1].words, times = [];
            if (orig.length === words.length) {
                for (var k = 0; k < words.length; k++) times.push(orig[k].s);
            } else {
                var s0 = orig[0].s, s1 = orig[orig.length - 1].e, tot = 0, acc = 0;
                for (k = 0; k < words.length; k++) tot += words[k].t.length + 1;
                for (k = 0; k < words.length; k++) { times.push(s0 + (s1 - s0) * acc / tot); acc += words[k].t.length + 1; }
                L(name + ": " + orig.length + " -> " + words.length + " words, timing spread");
            }

            // measure (RTL): word k spans [R - W(prefix..k), R - W(prefix..k) + W(word k)]
            var tmp = comp.layers.addText("x");
            var tst = tmp.property("ADBE Text Properties").property("ADBE Text Document");
            var width = function (s) { var d = st.value; d.text = s; tst.setValue(d); return tmp.sourceRectAtTime(0, false); };
            var full = width(text), R = full.left + full.width, spans = [];
            for (k = 0; k < words.length; k++) {
                var pw = width(text.substring(0, words[k].b)).width, ww = width(words[k].t).width;
                spans.push([R - pw, R - pw + ww]);
            }
            tmp.remove();
            var yLine = full.top + full.height + U.gap;

            var tr = txt.property("ADBE Transform Group");
            tr.property("ADBE Anchor Point").expression = "var r = sourceRectAtTime(" + FIXED + ", false);\n[r.left + r.width / 2, r.top + r.height / 2];";
            if (box) box.motionBlur = !!S.motionBlur;

            // line entrance
            var t0 = txt.inPoint, pos = tr.property("ADBE Position"), sc = tr.property("ADBE Scale"), op = tr.property("ADBE Opacity");
            var base = pos.numKeys ? pos.keyValue(pos.numKeys) : pos.value;
            clearKeys(pos); clearKeys(sc); clearKeys(op);
            pos.setValueAtTime(t0, [base[0], base[1] + E.rise]);
            pos.setValueAtTime(t0 + E.duration, [base[0], base[1]]);
            sc.setValueAtTime(t0, [E.startScale, E.startScale, 100]);
            sc.setValueAtTime(t0 + E.duration, [100, 100, 100]);
            op.setValueAtTime(t0, 0);
            op.setValueAtTime(t0 + 0.16, 100);
            ease(pos, 1, 15); ease(pos, 2, 90); ease(sc, 1, 15); ease(sc, 2, 90); ease(op, 1, 30); ease(op, 2, 60);
            txt.motionBlur = !!S.motionBlur;

            // word cascade
            var anims = txt.property("ADBE Text Properties").property("ADBE Text Animators");
            for (var a = anims.numProperties; a >= 1; a--) if (anims.property(a).name === "Reveal") anims.property(a).remove();
            var an = anims.addProperty("ADBE Text Animator"); an.name = "Reveal";
            var ap = an.property("ADBE Text Animator Properties");
            ap.addProperty("ADBE Text Position 3D").setValue([0, E.wordRise, 0]);
            ap.addProperty("ADBE Text Opacity").setValue(0);
            try { ap.addProperty("ADBE Text Blur").setValue([E.wordBlur, E.wordBlur]); } catch (e) { L("blur: " + e); }
            var sel = an.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
            var adv = sel.property("ADBE Text Range Advanced");
            adv.property("ADBE Text Range Type2").setValue(3); // words
            adv.property("ADBE Text Range Shape").setValue(2); // ramp up
            var off = sel.property("ADBE Text Percent Offset");
            off.setValueAtTime(t0, -100); off.setValueAtTime(t0 + E.cascade, 100);
            ease(off, 1, 20); ease(off, 2, 75);

            // underline
            var ul = comp.layers.addShape(); ul.name = name + " LINE";
            ul.moveAfter(txt); ul.inPoint = txt.inPoint; ul.outPoint = txt.outPoint;
            var g = ul.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name = "Underline";
            ul.property("ADBE Root Vectors Group").property("Underline").property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
            var uf = ul.property("ADBE Root Vectors Group").property("Underline").property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
            uf.property("ADBE Vector Fill Color").setValue(hex(U.color));
            var ur = ul.property("ADBE Root Vectors Group").property("Underline").property("ADBE Vectors Group").property("ADBE Vector Shape - Rect");
            ur.property("ADBE Vector Rect Roundness").setValue(U.height / 2);
            ul.parent = txt;
            var ut = ul.property("ADBE Transform Group");
            ut.property("ADBE Anchor Point").setValue([0, 0]);
            ut.property("ADBE Position").setValue([0, 0]);
            ut.property("ADBE Scale").setValue([100, 100]);
            ut.property("ADBE Opacity").expression = "thisLayer.parent.transform.opacity;";
            ul.motionBlur = !!S.motionBlur;
            ur = ul.property("ADBE Root Vectors Group").property("Underline").property("ADBE Vectors Group").property("ADBE Vector Shape - Rect");
            var usz = ur.property("ADBE Vector Rect Size"), ups = ur.property("ADBE Vector Rect Position");
            for (k = 0; k < words.length; k++) {
                var tk = Math.max(times[k], ul.inPoint);
                if (k > 0 && tk - U.slide > times[k - 1] + 0.01) {
                    usz.setValueAtTime(tk - U.slide, [spans[k - 1][1] - spans[k - 1][0], U.height]);
                    ups.setValueAtTime(tk - U.slide, [(spans[k - 1][0] + spans[k - 1][1]) / 2, yLine]);
                }
                usz.setValueAtTime(tk, [spans[k][1] - spans[k][0], U.height]);
                ups.setValueAtTime(tk, [(spans[k][0] + spans[k][1]) / 2, yLine]);
            }
            for (k = 1; k <= usz.numKeys; k++) ease(usz, k, 70);
            for (k = 1; k <= ups.numKeys; k++) ease(ups, k, 70);
        }
        app.endUndoGroup();
        proj.save();
        L("saved " + proj.file.fsName);

        var mid = cues[Math.floor(cues.length / 2)];
        var checks = [cues[0].s + 0.12, (cues[0].s + cues[0].e) / 2, (mid.s + mid.e) / 2];
        for (var q = 0; q < checks.length; q++) {
            try { comp.saveFrameToPng(checks[q], new File(JOB_DIR + "/check_" + q + ".png")); } catch (e) { L("png: " + e); }
        }
        L("checks at " + checks.join(", ") + " s -> check_0..2.png");
        L("OK layers=" + comp.numLayers);
    } catch (err) {
        L("ERROR line " + err.line + ": " + err.toString());
        try { app.endUndoGroup(); } catch (e) {}
    }
    var o = new File(JOB_DIR + "/ae_log.txt"); o.encoding = "UTF-8"; o.open("w"); o.write(log.join("\n")); o.close();
})();
