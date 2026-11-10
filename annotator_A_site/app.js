(() => {
  "use strict";
  const items = window.AUDIT_ITEMS;
  const bundle = window.AUDIT_BUNDLE;
  if (!Array.isArray(items) || !items.length || !bundle) throw new Error("Item manifest missing");
  const key = `image-caption-audit-v1-${bundle}`;
  const choices = {q1: ["Yes", "No", "Unclear"], q2: ["Yes", "No", "Not applicable", "Unclear"], q3: ["Yes", "No", "Unclear"]};
  const choiceLabels = {"Yes": "Yes / 예", "No": "No / 아니요", "Unclear": "Unclear / 판단 어려움", "Not applicable": "Not applicable / 해당 없음"};
  const $ = id => document.getElementById(id);
  const ids = new Set(items.map(x => x.item_id));
  if (ids.size !== items.length) throw new Error("Duplicate item ID");

  let state = {cursor: 0, answers: {}};
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "null");
    if (stored && stored.bundle === bundle && stored.manifest_ids === items.map(x => x.item_id).join("|")) {
      state = {cursor: Math.max(0, Math.min(items.length - 1, stored.cursor || 0)), answers: stored.answers || {}};
    }
  } catch (error) { $("message").textContent = "Browser storage is unavailable; exports will still work during this session. / 브라우저 저장을 사용할 수 없습니다. 현재 세션에서는 내보내기를 이용하세요."; }

  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify({bundle, manifest_ids: items.map(x => x.item_id).join("|"), cursor: state.cursor, answers: state.answers}));
    } catch (error) { $("message").textContent = "Could not save in this browser. Keep this tab open until export. / 브라우저에 저장할 수 없습니다. 내보내기 전까지 이 탭을 닫지 마세요."; }
  }
  function complete(answer) { return answer && choices.q1.includes(answer.q1) && choices.q2.includes(answer.q2) && choices.q3.includes(answer.q3); }
  function completedCount() { return items.filter(item => complete(state.answers[item.item_id])).length; }
  function updateProgress() {
    const count = completedCount();
    $("position").textContent = `Item ${state.cursor + 1} / ${items.length} · 항목 ${state.cursor + 1} / ${items.length}`;
    $("completed").textContent = `${count} / ${items.length} completed · 완료`;
    $("progress").max = items.length;
    $("progress").value = count;
    $("previous").disabled = state.cursor === 0;
    const ready = count === items.length;
    $("export-json").disabled = !ready;
    $("export-csv").disabled = !ready;
    $("next").textContent = state.cursor === items.length - 1 ? "Save final item / 마지막 항목 저장" : "Save & next / 저장 후 다음";
  }
  function makeOptions(question) {
    const target = $(`${question}-options`);
    for (const value of choices[question]) {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio"; radio.name = question; radio.value = value;
      radio.addEventListener("change", () => {
        const itemId = items[state.cursor].item_id;
        state.answers[itemId] = {...(state.answers[itemId] || {}), [question]: value};
        persist(); updateProgress();
        $("message").textContent = "";
      });
      label.append(radio, document.createTextNode(choiceLabels[value]));
      target.append(label);
    }
  }
  for (const question of Object.keys(choices)) makeOptions(question);

  function render() {
    const item = items[state.cursor];
    $("image1").src = item.image_1;
    $("image2").src = item.image_2;
    $("caption").textContent = item.caption;
    const answer = state.answers[item.item_id] || {};
    for (const question of Object.keys(choices)) {
      for (const radio of document.querySelectorAll(`input[name="${question}"]`)) radio.checked = radio.value === answer[question];
    }
    $("message").textContent = "";
    updateProgress();
  }
  $("annotator-code").textContent = `Reviewer ${bundle} / 평가자 ${bundle}`;
  $("item-count").textContent = items.length;
  $("item-count-ko").textContent = items.length;
  $("start").addEventListener("click", () => { $("instructions").hidden = true; $("annotation").hidden = false; render(); });
  $("previous").addEventListener("click", () => { if (state.cursor > 0) { state.cursor--; persist(); render(); } });
  $("next").addEventListener("click", () => {
    if (!complete(state.answers[items[state.cursor].item_id])) {
      $("message").textContent = "Answer all three questions before continuing. / 계속하려면 세 질문 모두 답하세요.";
      return;
    }
    if (state.cursor < items.length - 1) { state.cursor++; persist(); render(); }
    else { persist(); updateProgress(); $("message").textContent = "All items complete. Export both files below. / 모든 항목을 완료했습니다. 아래에서 결과를 저장하세요."; }
  });
  function exportRows() {
    if (completedCount() !== items.length) throw new Error("All items must be complete before export");
    return items.map(item => ({annotator: bundle, item_id: item.item_id,
      q1: state.answers[item.item_id].q1, q2: state.answers[item.item_id].q2, q3: state.answers[item.item_id].q3}));
  }
  function download(filename, content, mime) {
    const url = URL.createObjectURL(new Blob([content], {type: mime}));
    const link = document.createElement("a");
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("export-json").addEventListener("click", () => {
    const rows = exportRows();
    download(`annotator_${bundle}_results.json`, JSON.stringify({schema: "human_image_audit_v1", annotator: bundle,
      item_count: items.length, responses: rows}, null, 2) + "\n", "application/json");
  });
  $("export-progress").addEventListener("click", () => {
    const responses = items.map(item => {
      const answer = state.answers[item.item_id] || {};
      return {annotator: bundle, item_id: item.item_id,
        q1: answer.q1 || null, q2: answer.q2 || null, q3: answer.q3 || null};
    });
    download(`annotator_${bundle}_progress.json`, JSON.stringify({schema: "human_image_audit_progress_v1",
      annotator: bundle, item_count: items.length, cursor: state.cursor, responses}, null, 2) + "\n", "application/json");
  });
  $("export-csv").addEventListener("click", () => {
    const quote = value => `"${String(value).replaceAll('"', '""')}"`;
    const lines = ["annotator,item_id,q1,q2,q3", ...exportRows().map(row =>
      [row.annotator, row.item_id, row.q1, row.q2, row.q3].map(quote).join(","))];
    download(`annotator_${bundle}_results.csv`, lines.join("\r\n") + "\r\n", "text/csv");
  });
  for (const button of document.querySelectorAll(".image-open")) {
    button.addEventListener("click", () => {
      const source = button.querySelector("img");
      $("zoom-image").src = source.src;
      $("zoom-image").alt = `Enlarged ${source.alt}`;
      $("image-dialog").showModal();
    });
  }
  $("close-image").addEventListener("click", () => $("image-dialog").close());
  document.addEventListener("keydown", event => {
    if ($("annotation").hidden || event.target instanceof HTMLInputElement ||
        event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" && state.cursor > 0) $("previous").click();
    if (event.key === "ArrowRight") $("next").click();
  });
})();
