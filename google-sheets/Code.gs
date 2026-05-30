/**
 * 现金流跟踪表 · Google Apps Script
 *
 * 使用方法：
 * 1. 新建一个空白 Google Sheet
 * 2. 菜单：扩展程序 → Apps Script
 * 3. 把本文件 (Code.gs) 和 Sidebar.html 的内容粘贴进去
 * 4. 保存，回到 Sheet，刷新页面
 * 5. 顶部会出现「📊 现金流」菜单 → 初始化 / 重置表格
 * 6. 完成后用「新增记录」侧边栏录入数据
 */

// ============ 配置 ============
const SHEET_ENTRIES   = '录入';
const SHEET_CATEGORIES = '类别';
const SHEET_PRINCIPAL  = '本金';
const SHEET_SUMMARY    = '月度汇总';
const SHEET_DASHBOARD  = '仪表盘';
const SHEET_SETTINGS   = '设置';

const THEME = {
  bg:      '#F5F5F7',
  card:    '#FFFFFF',
  border:  '#EBEBEB',
  text1:   '#1A1A1A',
  text2:   '#666666',
  text3:   '#BBBBBB',
  accent:  '#FA6400',
  positive:'#09B87A',
  negative:'#E84646',
  inputBg: '#FFFBF5',
  thBg:    '#F8F8F8',
  totalBg: '#F0FBF5',
};

const DEFAULT_CATEGORIES = [
  ['每月股息', '收入'],
  ['Bitfinex 放贷', '收入'],
  ['港股打新', '收入'],
  ['链上机会', '收入'],
  ['守拙基金分红', '收入'],
];

const DEFAULT_RULES = [
  '不炒股票',
  '不炒币，只做周期交易',
  '不买山寨，远离诈骗',
];

const NUM_FMT_USD = '"$"#,##0;[Red]"-$"#,##0;"—"';
const NUM_FMT_PCT = '0.0%;[Red]-0.0%;"—"';

// ============ 菜单 ============
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 现金流')
    .addItem('新增记录', 'showEntryForm')
    .addSeparator()
    .addItem('初始化 / 重置表格', 'setupSpreadsheet')
    .addItem('重新应用样式', 'applyTheme')
    .addItem('重建图表', 'rebuildCharts')
    .addSeparator()
    .addItem('导出 CSV', 'exportToCsv')
    .addToUi();
}

// ============ 录入侧边栏 ============
function showEntryForm() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('新增记录')
    .setWidth(320);
  SpreadsheetApp.getUi().showSidebar(html);
}

function getFormConfig() {
  const ss = SpreadsheetApp.getActive();
  const cats = ss.getSheetByName(SHEET_CATEGORIES)
    .getRange('A2:B')
    .getValues()
    .filter(r => r[0])
    .map(r => ({ name: r[0], type: r[1] }));
  return { categories: cats };
}

function addEntry(data) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEET_ENTRIES);
  const today = new Date();
  const month = data.month || Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM');
  sheet.appendRow([
    today,
    month,
    data.category,
    parseFloat(data.amount) || 0,
    data.note || '',
  ]);
  sortEntries();
  return { success: true };
}

function sortEntries() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_ENTRIES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  sheet.getRange(2, 1, lastRow - 1, 5).sort([{ column: 2, ascending: true }, { column: 1, ascending: true }]);
}

// ============ 主初始化函数 ============
function setupSpreadsheet() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    '初始化表格',
    '会创建/重置以下 Sheet：录入、类别、本金、月度汇总、仪表盘、设置。\n已有数据可能丢失。继续？',
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  const ss = SpreadsheetApp.getActive();

  buildEntriesSheet(ss);
  buildCategoriesSheet(ss);
  buildPrincipalSheet(ss);
  buildSettingsSheet(ss);
  buildSummarySheet(ss);
  buildDashboardSheet(ss);

  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('工作表1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  ss.setActiveSheet(ss.getSheetByName(SHEET_DASHBOARD));

  ui.alert('完成', '初始化完成。用菜单「新增记录」开始录入。', ui.ButtonSet.OK);
}

// ============ 构建：录入 ============
function buildEntriesSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_ENTRIES);
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet(SHEET_ENTRIES, 0);

  sheet.getRange('A1:E1').setValues([['日期', '月份', '类别', '金额(USD)', '备注']]);
  styleHeader(sheet.getRange('A1:E1'));

  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 260);

  sheet.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('B2:B').setNumberFormat('@');
  sheet.getRange('D2:D').setNumberFormat(NUM_FMT_USD);

  sheet.setFrozenRows(1);
  sheet.getRange('A1:E1000').setFontFamily('Helvetica Neue');
  styleBody(sheet, 1000, 5);
}

// ============ 构建：类别 ============
function buildCategoriesSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_CATEGORIES);
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet(SHEET_CATEGORIES);

  sheet.getRange('A1:B1').setValues([['类别名', '类型']]);
  styleHeader(sheet.getRange('A1:B1'));

  const rows = DEFAULT_CATEGORIES;
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);

  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 100);

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['收入', '定投'], true)
    .build();
  sheet.getRange(2, 2, 100, 1).setDataValidation(rule);

  sheet.setFrozenRows(1);
  styleBody(sheet, 50, 2);
}

// ============ 构建：本金 ============
function buildPrincipalSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_PRINCIPAL);
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet(SHEET_PRINCIPAL);

  sheet.getRange('A1:D1').setValues([['类别', '本金 (USD)', 'YTD 收入', '年化']]);
  styleHeader(sheet.getRange('A1:D1'));

  const cats = DEFAULT_CATEGORIES.filter(c => c[1] === '收入').map(c => c[0]);
  cats.forEach((cat, i) => {
    const row = i + 2;
    sheet.getRange(row, 1).setValue(cat);
    sheet.getRange(row, 2).setValue(0);
    sheet.getRange(row, 3).setFormula(
      `=IFERROR(SUMIFS(${SHEET_ENTRIES}!D:D, ${SHEET_ENTRIES}!C:C, A${row}, ${SHEET_ENTRIES}!B:B, ">="&设置!B2&"-01", ${SHEET_ENTRIES}!B:B, "<="&设置!B2&"-12"), 0)`
    );
    sheet.getRange(row, 4).setFormula(`=IF(B${row}>0, C${row}/B${row}, "")`);
  });

  const totalRow = cats.length + 2;
  sheet.getRange(totalRow, 1).setValue('合计');
  sheet.getRange(totalRow, 2).setFormula(`=SUM(B2:B${totalRow - 1})`);
  sheet.getRange(totalRow, 3).setFormula(`=SUM(C2:C${totalRow - 1})`);
  sheet.getRange(totalRow, 4).setFormula(`=IF(B${totalRow}>0, C${totalRow}/B${totalRow}, "")`);
  styleTotalRow(sheet.getRange(totalRow, 1, 1, 4));

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 100);

  sheet.getRange('B2:C').setNumberFormat(NUM_FMT_USD);
  sheet.getRange('D2:D').setNumberFormat(NUM_FMT_PCT);
  sheet.getRange('B2:B' + (totalRow - 1)).setBackground(THEME.inputBg);

  sheet.setFrozenRows(1);
  styleBody(sheet, totalRow + 5, 4);
}

// ============ 构建：设置 ============
function buildSettingsSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet(SHEET_SETTINGS);

  sheet.getRange('A1:B1').setValues([['项', '值']]);
  styleHeader(sheet.getRange('A1:B1'));

  const currentYear = new Date().getFullYear();
  const settings = [
    ['年份', currentYear],
    ['货币', 'USD'],
    ['', ''],
    ['纪律红线 1', DEFAULT_RULES[0]],
    ['纪律红线 2', DEFAULT_RULES[1]],
    ['纪律红线 3', DEFAULT_RULES[2]],
  ];
  sheet.getRange(2, 1, settings.length, 2).setValues(settings);

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 280);

  styleBody(sheet, 20, 2);
}

// ============ 构建：月度汇总 ============
function buildSummarySheet(ss) {
  let sheet = ss.getSheetByName(SHEET_SUMMARY);
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet(SHEET_SUMMARY);

  const incomeCats = DEFAULT_CATEGORIES.filter(c => c[1] === '收入').map(c => c[0]);
  const headers = ['月份', ...incomeCats, '本月合计', 'YTD'];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader(sheet.getRange(1, 1, 1, headers.length));

  for (let i = 0; i < 12; i++) {
    const row = i + 2;
    const monthStr = `=设置!B2&"-"&TEXT(${i + 1}, "00")`;
    sheet.getRange(row, 1).setFormula(monthStr);

    incomeCats.forEach((cat, ci) => {
      const col = ci + 2;
      sheet.getRange(row, col).setFormula(
        `=IFERROR(SUMIFS(${SHEET_ENTRIES}!D:D, ${SHEET_ENTRIES}!C:C, ${colLetter(col)}$1, ${SHEET_ENTRIES}!B:B, $A${row}), 0)`
      );
    });

    const totalCol = incomeCats.length + 2;
    sheet.getRange(row, totalCol).setFormula(
      `=SUM(B${row}:${colLetter(totalCol - 1)}${row})`
    );

    const ytdCol = incomeCats.length + 3;
    sheet.getRange(row, ytdCol).setFormula(
      `=SUM($${colLetter(totalCol)}$2:${colLetter(totalCol)}${row})`
    );
  }

  const totalRow = 14;
  sheet.getRange(totalRow, 1).setValue('年度合计');
  for (let c = 2; c <= headers.length - 1; c++) {
    sheet.getRange(totalRow, c).setFormula(`=SUM(${colLetter(c)}2:${colLetter(c)}13)`);
  }
  sheet.getRange(totalRow, headers.length).setFormula(
    `=${colLetter(headers.length - 1)}${totalRow}`
  );
  styleTotalRow(sheet.getRange(totalRow, 1, 1, headers.length));

  sheet.getRange(2, 2, 13, headers.length - 1).setNumberFormat(NUM_FMT_USD);
  sheet.setColumnWidth(1, 80);
  for (let c = 2; c <= headers.length; c++) {
    sheet.setColumnWidth(c, 110);
  }

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  styleBody(sheet, 16, headers.length);
}

// ============ 构建：仪表盘 ============
function buildDashboardSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_DASHBOARD);
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet(SHEET_DASHBOARD, 0);

  sheet.getRange('B2').setValue('CASHFLOW TRACKER').setFontSize(11)
    .setFontColor(THEME.text3).setFontWeight('normal');
  sheet.getRange('B3').setValue('现金流 · 跟踪表').setFontSize(22)
    .setFontWeight('bold').setFontColor(THEME.text1);
  sheet.getRange('B4').setFormula(`="始于 "&设置!B2&" 年 · 月月不落"`)
    .setFontSize(11).setFontColor(THEME.text3);

  sheet.getRange('G2').setValue('年度现金流').setFontSize(10)
    .setFontColor(THEME.text2).setHorizontalAlignment('right');
  sheet.getRange('G3').setFormula(`=月度汇总!N14`)
    .setFontSize(22).setFontWeight('bold')
    .setFontColor(THEME.positive)
    .setNumberFormat(NUM_FMT_USD)
    .setHorizontalAlignment('right');
  sheet.getRange('G3').setBackground(THEME.totalBg);

  const kpiRow = 7;
  sheet.getRange(kpiRow, 2, 1, 4).setValues([['月均', '本月', '总本金', '年化']]);
  sheet.getRange(kpiRow, 2, 1, 4).setFontSize(10).setFontColor(THEME.text2)
    .setFontWeight('normal');

  sheet.getRange(kpiRow + 1, 2).setFormula(
    `=IFERROR(月度汇总!N14/MONTH(TODAY()), 0)`
  );
  sheet.getRange(kpiRow + 1, 3).setFormula(
    `=IFERROR(INDEX(月度汇总!M2:M13, MONTH(TODAY())), 0)`
  );
  sheet.getRange(kpiRow + 1, 4).setFormula(`=本金!B${DEFAULT_CATEGORIES.filter(c=>c[1]==='收入').length + 2}`);
  sheet.getRange(kpiRow + 1, 5).setFormula(
    `=IF(E${kpiRow}>0, 月度汇总!N14/E${kpiRow + 1}, "")`
  );

  sheet.getRange(kpiRow + 1, 2, 1, 3).setNumberFormat(NUM_FMT_USD);
  sheet.getRange(kpiRow + 1, 5).setNumberFormat(NUM_FMT_PCT);
  sheet.getRange(kpiRow + 1, 2, 1, 4).setFontSize(18).setFontWeight('bold')
    .setFontColor(THEME.text1);

  for (let c = 2; c <= 5; c++) {
    sheet.getRange(kpiRow, c, 2, 1)
      .setBackground(THEME.card)
      .setBorder(true, true, true, true, false, false, THEME.border, SpreadsheetApp.BorderStyle.SOLID);
  }

  sheet.getRange('B11').setValue('月度趋势').setFontSize(11).setFontWeight('bold');
  sheet.getRange('B25').setValue('类别占比').setFontSize(11).setFontWeight('bold');
  sheet.getRange('E25').setValue('月度构成').setFontSize(11).setFontWeight('bold');

  sheet.setColumnWidth(1, 24);
  for (let c = 2; c <= 7; c++) sheet.setColumnWidth(c, 130);
  sheet.setColumnWidth(8, 24);

  sheet.setRowHeight(2, 22);
  sheet.setRowHeight(3, 36);
  sheet.setRowHeight(4, 22);
  sheet.setRowHeight(kpiRow, 22);
  sheet.setRowHeight(kpiRow + 1, 36);

  sheet.getRange('A1:H40').setBackground(THEME.bg);
  sheet.getRange('A1:H40').setBorder(false, false, false, false, false, false);

  sheet.setHiddenGridlines(true);

  buildCharts(ss, sheet);
}

// ============ 图表 ============
function rebuildCharts() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEET_DASHBOARD);
  if (!sheet) return;
  sheet.getCharts().forEach(c => sheet.removeChart(c));
  buildCharts(ss, sheet);
}

function buildCharts(ss, sheet) {
  const summary = ss.getSheetByName(SHEET_SUMMARY);
  const incomeCats = DEFAULT_CATEGORIES.filter(c => c[1] === '收入').map(c => c[0]);
  const totalCol = incomeCats.length + 2;
  const totalColLetter = colLetter(totalCol);

  const lineChart = sheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(summary.getRange(`A1:A13`))
    .addRange(summary.getRange(`${totalColLetter}1:${totalColLetter}13`))
    .setOption('title', '')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [THEME.accent])
    .setOption('lineWidth', 2)
    .setOption('pointSize', 4)
    .setOption('hAxis', { textStyle: { color: THEME.text2, fontSize: 10 }, gridlines: { color: 'transparent' } })
    .setOption('vAxis', { textStyle: { color: THEME.text2, fontSize: 10 }, gridlines: { color: '#EEEEEE', count: 5 }, format: '$#,##0' })
    .setOption('backgroundColor', THEME.card)
    .setOption('chartArea', { left: 60, top: 20, width: '85%', height: '75%' })
    .setPosition(12, 2, 0, 0)
    .setOption('width', 760)
    .setOption('height', 240)
    .build();
  sheet.insertChart(lineChart);

  const pieChart = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(summary.getRange(`B1:${colLetter(incomeCats.length + 1)}1`))
    .addRange(summary.getRange(`B14:${colLetter(incomeCats.length + 1)}14`))
    .setOption('title', '')
    .setOption('pieHole', 0.5)
    .setOption('legend', { position: 'right', textStyle: { color: THEME.text2, fontSize: 10 } })
    .setOption('colors', ['#FA6400', '#FFA15C', '#FFD0A8', '#09B87A', '#7BD3B5'])
    .setOption('pieSliceBorderColor', THEME.card)
    .setOption('backgroundColor', THEME.card)
    .setOption('chartArea', { left: 0, top: 10, width: '95%', height: '85%' })
    .setPosition(26, 2, 0, 0)
    .setOption('width', 370)
    .setOption('height', 240)
    .build();
  sheet.insertChart(pieChart);

  const barChart = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(summary.getRange(`A1:${colLetter(incomeCats.length + 1)}13`))
    .setOption('isStacked', true)
    .setOption('title', '')
    .setOption('legend', { position: 'bottom', textStyle: { color: THEME.text2, fontSize: 10 } })
    .setOption('colors', ['#FA6400', '#FFA15C', '#FFD0A8', '#09B87A', '#7BD3B5'])
    .setOption('hAxis', { textStyle: { color: THEME.text2, fontSize: 10 } })
    .setOption('vAxis', { textStyle: { color: THEME.text2, fontSize: 10 }, gridlines: { color: '#EEEEEE' }, format: '$#,##0' })
    .setOption('backgroundColor', THEME.card)
    .setOption('chartArea', { left: 60, top: 20, width: '85%', height: '70%' })
    .setPosition(26, 5, 0, 0)
    .setOption('width', 390)
    .setOption('height', 240)
    .build();
  sheet.insertChart(barChart);
}

// ============ 样式工具 ============
function styleHeader(range) {
  range.setBackground(THEME.thBg)
    .setFontColor(THEME.text2)
    .setFontSize(11)
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setBorder(false, false, true, false, false, false, THEME.border, SpreadsheetApp.BorderStyle.SOLID);
}

function styleBody(sheet, rows, cols) {
  const range = sheet.getRange(2, 1, rows, cols);
  range.setFontFamily('Helvetica Neue')
    .setFontSize(12)
    .setFontColor(THEME.text1)
    .setVerticalAlignment('middle');
  for (let r = 2; r <= rows + 1; r++) {
    sheet.setRowHeight(r, 30);
  }
  sheet.setRowHeight(1, 32);
}

function styleTotalRow(range) {
  range.setBackground(THEME.totalBg)
    .setFontColor(THEME.positive)
    .setFontWeight('bold')
    .setBorder(true, false, false, false, false, false, THEME.border, SpreadsheetApp.BorderStyle.SOLID);
  range.getCell(1, 1).setFontColor(THEME.text1);
}

function applyTheme() {
  const ss = SpreadsheetApp.getActive();
  [SHEET_ENTRIES, SHEET_CATEGORIES, SHEET_PRINCIPAL, SHEET_SUMMARY, SHEET_SETTINGS].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) sheet.setHiddenGridlines(false);
  });
  const dash = ss.getSheetByName(SHEET_DASHBOARD);
  if (dash) dash.setHiddenGridlines(true);
  SpreadsheetApp.getUi().alert('样式已重新应用');
}

// ============ 导出 CSV ============
function exportToCsv() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEET_ENTRIES);
  const data = sheet.getDataRange().getValues();
  const csv = data.map(row =>
    row.map(cell => {
      const s = String(cell);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');

  const blob = Utilities.newBlob('﻿' + csv, 'text/csv', `cashflow-${Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')}.csv`);
  const file = DriveApp.createFile(blob);
  SpreadsheetApp.getUi().alert('已导出', `CSV 已保存到 Google Drive：\n${file.getUrl()}`, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ============ 工具 ============
function colLetter(col) {
  let letter = '';
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - mod) / 26);
  }
  return letter;
}
