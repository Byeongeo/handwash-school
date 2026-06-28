/**
 * 손씻기 코칭 연수 앱 — Google Sheets / Apps Script 백엔드
 *
 * 설치 순서
 * 1) Google Sheets 사본을 만든다.
 * 2) 확장 프로그램 > Apps Script에서 이 파일 내용을 Code.gs에 붙여넣고 저장한다.
 * 3) 함수 목록에서 setup을 실행해 탭과 예시 데이터를 만든다.
 * 4) 배포 > 새 배포 > 웹 앱
 *    - 실행: 나
 *    - 액세스 권한: 모든 사용자
 * 5) 웹앱 URL(/exec)을 Vercel 환경변수 APPS_SCRIPT_URL에 넣는다.
 * 6) 선택: setSecret 값을 바꿔 실행하고, 같은 값을 Vercel APP_SHARED_SECRET에 넣는다.
 */

var TABS = {
  students: "student list",
  samples: "samples",
  records: "records",
  config: "config"
};

var STEP_KEYS = ["palm", "back", "between", "fingers", "thumb", "nails"];
var LABEL_KEYS = ["palm", "back", "between", "fingers", "thumb", "nails", "other"];

var DEFAULTS = {
  pointsPerCompletion: 10,
  requiredSeconds: 3,
  confidenceThreshold: 65,
  activeSampleSet: "default",
  displaySec: 4,
  allowUnregistered: "Y",
  messageComplete: "{이름} 학생, 손씻기 6단계를 완료했습니다."
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("손씻기 코칭")
    .addItem("초기 설정", "setup")
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureTab_(ss, TABS.students, ["학번", "이름", "QR(자동)"], [
    ["3-2-15", "홍길동"],
    ["3-2-16", "김보건"]
  ]);
  fillQrColumn_(ss.getSheetByName(TABS.students));

  ensureTab_(ss, TABS.samples, ["시각", "세트", "라벨", "featureJson", "기기", "source"], []);
  ensureTab_(ss, TABS.records, [
    "시각",
    "학번",
    "이름",
    "완료",
    "점수",
    "목표초",
    "신뢰도",
    "샘플세트",
    "부족단계",
    "손바닥초",
    "손등초",
    "깍지초",
    "손가락초",
    "엄지초",
    "손톱초"
  ], []);
  ensureTab_(ss, TABS.config, ["키", "값"], [
    ["pointsPerCompletion", DEFAULTS.pointsPerCompletion],
    ["requiredSeconds", DEFAULTS.requiredSeconds],
    ["confidenceThreshold", DEFAULTS.confidenceThreshold],
    ["activeSampleSet", DEFAULTS.activeSampleSet],
    ["displaySec", DEFAULTS.displaySec],
    ["allowUnregistered", DEFAULTS.allowUnregistered],
    ["messageComplete", DEFAULTS.messageComplete]
  ]);

  ss.toast("손씻기 코칭 앱 초기 설정이 끝났습니다.", "손씻기 코칭", 5);
}

function setSecret() {
  PropertiesService.getScriptProperties().setProperty("SECRET", "여기에-비밀키-입력");
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (!checkSecret_(p.secret)) return json_({ ok: false, message: "인증 실패" });

    var action = p.action || "config";
    if (action === "config") return json_(getConfigResponse_());
    if (action === "samples") return json_(getSamplesResponse_(p.set || ""));
    if (action === "summary") return json_(getSummaryResponse_());
    return json_({ ok: false, message: "알 수 없는 action입니다." });
  } catch (err) {
    return json_({ ok: false, message: errMsg_(err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    if (!checkSecret_(body.secret)) return json_({ ok: false, message: "인증 실패" });

    if (body.action === "samples") return json_(saveSamples_(body));
    if (body.action === "record") return json_(saveRecord_(body.record || {}));
    return json_({ ok: false, message: "알 수 없는 action입니다." });
  } catch (err) {
    return json_({ ok: false, message: errMsg_(err) });
  }
}

function getConfigResponse_() {
  var config = getConfig_(SpreadsheetApp.getActiveSpreadsheet());
  return {
    ok: true,
    pointsPerCompletion: config.pointsPerCompletion,
    requiredSeconds: config.requiredSeconds,
    confidenceThreshold: config.confidenceThreshold,
    activeSampleSet: config.activeSampleSet,
    displaySec: config.displaySec,
    allowUnregistered: config.allowUnregistered === "Y",
    messageComplete: config.messageComplete
  };
}

function getSamplesResponse_(setName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var config = getConfig_(ss);
  var targetSet = setName || config.activeSampleSet || "default";
  var rows = readTab_(ss, TABS.samples);
  var samples = [];

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var rowSet = cell_(row[1]) || "default";
    if (targetSet && rowSet !== targetSet) continue;
    var label = cell_(row[2]);
    if (LABEL_KEYS.indexOf(label) < 0) continue;
    try {
      var feature = JSON.parse(row[3]);
      if (!Array.isArray(feature)) continue;
      samples.push({
        label: label,
        feature: feature,
        createdAt: cell_(row[0]),
        setName: rowSet,
        device: cell_(row[4]),
        source: cell_(row[5])
      });
    } catch (err) {
      // 잘못된 행은 건너뜀
    }
  }

  return { ok: true, setName: targetSet, samples: samples };
}

function getSummaryResponse_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var config = getConfig_(ss);
  var sampleRows = readTab_(ss, TABS.samples);
  var counts = {};
  LABEL_KEYS.forEach(function (key) { counts[key] = 0; });
  for (var i = 1; i < sampleRows.length; i++) {
    var label = cell_(sampleRows[i][2]);
    if (counts[label] != null) counts[label] += 1;
  }

  var recordRows = readTab_(ss, TABS.records);
  var headers = recordRows[0] || [];
  var recent = [];
  for (var r = Math.max(1, recordRows.length - 10); r < recordRows.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = recordRows[r][c];
    recent.unshift(obj);
  }

  return {
    ok: true,
    config: config,
    sampleCounts: counts,
    recentRecords: recent
  };
}

function saveSamples_(body) {
  var samples = Array.isArray(body.samples) ? body.samples : [];
  if (!samples.length) return { ok: false, message: "저장할 샘플이 없습니다." };
  if (samples.length > 500) return { ok: false, message: "한 번에 500개 이하로 업로드하세요." };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TABS.samples);
  if (!sh) throw new Error("samples 탭이 없습니다. setup을 먼저 실행하세요.");

  var setName = cell_(body.setName) || "default";
  var device = cell_(body.device);
  var now = new Date();
  var rows = [];
  for (var i = 0; i < samples.length; i++) {
    var sample = samples[i] || {};
    if (LABEL_KEYS.indexOf(String(sample.label)) < 0) continue;
    if (!Array.isArray(sample.feature)) continue;
    rows.push([
      sample.createdAt || Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss"),
      setName,
      String(sample.label),
      JSON.stringify(sample.feature),
      device || cell_(sample.device),
      cell_(sample.source) || "collect"
    ]);
  }
  if (!rows.length) return { ok: false, message: "유효한 샘플이 없습니다." };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, saved: rows.length };
}

function saveRecord_(record) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TABS.records);
  if (!sh) throw new Error("records 탭이 없습니다. setup을 먼저 실행하세요.");

  var config = getConfig_(ss);
  var id = cell_(record.studentId);
  if (!id) return { ok: false, message: "학번이 비어 있습니다." };
  var name = findStudentName_(ss, id) || cell_(record.studentName);
  if (!name && config.allowUnregistered !== "Y") return { ok: false, message: "등록되지 않은 학번입니다." };
  if (!name) name = "(미등록)";

  var steps = record.steps || {};
  var missing = Array.isArray(record.missingSteps) ? record.missingSteps.join(",") : "";
  var now = new Date();
  var nowStr = Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var row = [
    nowStr,
    id,
    name,
    record.completed ? "Y" : "N",
    Number(record.score) || 0,
    Number(record.requiredSeconds) || config.requiredSeconds,
    Number(record.confidenceThreshold) || config.confidenceThreshold,
    cell_(record.sampleSet) || config.activeSampleSet,
    missing,
    Number(steps.palm) || 0,
    Number(steps.back) || 0,
    Number(steps.between) || 0,
    Number(steps.fingers) || 0,
    Number(steps.thumb) || 0,
    Number(steps.nails) || 0
  ];

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, studentId: id, studentName: name, score: row[4] };
}

function getConfig_(ss) {
  var rows = readTab_(ss, TABS.config);
  var map = {};
  for (var i = 1; i < rows.length; i++) {
    var key = cell_(rows[i][0]);
    if (key) map[key] = rows[i][1];
  }
  return {
    pointsPerCompletion: number_(map.pointsPerCompletion, DEFAULTS.pointsPerCompletion),
    requiredSeconds: number_(map.requiredSeconds, DEFAULTS.requiredSeconds),
    confidenceThreshold: number_(map.confidenceThreshold, DEFAULTS.confidenceThreshold),
    activeSampleSet: cell_(map.activeSampleSet) || DEFAULTS.activeSampleSet,
    displaySec: number_(map.displaySec, DEFAULTS.displaySec),
    allowUnregistered: String(map.allowUnregistered || DEFAULTS.allowUnregistered).toUpperCase() === "N" ? "N" : "Y",
    messageComplete: cell_(map.messageComplete) || DEFAULTS.messageComplete
  };
}

function findStudentName_(ss, id) {
  var rows = readTab_(ss, TABS.students);
  for (var i = 1; i < rows.length; i++) {
    if (cell_(rows[i][0]) === id) return cell_(rows[i][1]);
  }
  return "";
}

function ensureTab_(ss, name, headers, examples) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var firstCell = sh.getRange(1, 1).getValue();
  if (firstCell === "" || firstCell === null) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    if (examples && examples.length) {
      sh.getRange(2, 1, examples.length, examples[0].length).setValues(examples);
    }
    sh.setFrozenRows(1);
  }
  return sh;
}

function fillQrColumn_(sh) {
  if (!sh) return;
  var last = 300;
  var formulas = [];
  for (var r = 2; r <= last; r++) {
    formulas.push([
      '=IF($A' + r + '="","",IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=180x180&data="&ENCODEURL($A' + r + '&" "&$B' + r + ')))'
    ]);
  }
  sh.getRange(2, 3, formulas.length, 1).setFormulas(formulas);
}

function readTab_(ss, name) {
  var sh = ss.getSheetByName(name);
  return sh ? sh.getDataRange().getValues() : [];
}

function checkSecret_(provided) {
  var secret = PropertiesService.getScriptProperties().getProperty("SECRET");
  if (!secret) return true;
  return String(provided || "") === String(secret);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function cell_(value) {
  return value == null ? "" : String(value).trim();
}

function number_(value, fallback) {
  var n = Number(value);
  return isFinite(n) ? n : fallback;
}

function errMsg_(err) {
  return err && err.message ? err.message : String(err);
}
