"""Single-sheet minimal cashflow tracker."""
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

BG       = 'F5F5F7'
CARD     = 'FFFFFF'
BORDER   = 'EBEBEB'
TEXT1    = '1A1A1A'
TEXT2    = '666666'
TEXT3    = 'BBBBBB'
POSITIVE = '09B87A'
INP_BG   = 'FFFBF5'
TH_BG    = 'F8F8F8'
TOTAL_BG = 'F0FBF5'

ITEMS = ['每月股息', 'Bitfinex 放贷', '港股打新', '链上机会', '守拙基金分红']
YEAR = datetime.now().year
NUM_FMT_USD = '"$"#,##0;[Red]"-$"#,##0;"—"'

MONTHS = [f'{YEAR}-{m:02d}' for m in range(1, 13)]

thin = Side(style='thin', color=BORDER)

wb = Workbook()
ws = wb.active
ws.title = f'{YEAR} 现金流'
ws.sheet_view.showGridLines = False

# 标题区
ws['B2'] = 'CASHFLOW TRACKER'
ws['B2'].font = Font(name='Helvetica Neue', size=10, color=TEXT3)
ws['B2'].alignment = Alignment(horizontal='left', vertical='center')

ws['B3'] = f'{YEAR} · 现金流跟踪表'
ws['B3'].font = Font(name='Helvetica Neue', size=22, bold=True, color=TEXT1)
ws['B3'].alignment = Alignment(horizontal='left', vertical='center')

n_items = len(ITEMS)
total_col_idx = 2 + n_items  # 月份列 + 款项列 + 合计列
total_col_letter = get_column_letter(total_col_idx)

# 右上 KPI：年度合计
kpi_label_col = total_col_idx
ws.cell(row=2, column=kpi_label_col, value='年度现金流')
ws.cell(row=2, column=kpi_label_col).font = Font(
    name='Helvetica Neue', size=10, color=TEXT2)
ws.cell(row=2, column=kpi_label_col).alignment = Alignment(
    horizontal='right', vertical='center')

ws.cell(row=3, column=kpi_label_col,
        value=f'={total_col_letter}{5 + 12}')  # 引用底部合计
ws.cell(row=3, column=kpi_label_col).font = Font(
    name='Helvetica Neue', size=20, bold=True, color=POSITIVE)
ws.cell(row=3, column=kpi_label_col).alignment = Alignment(
    horizontal='right', vertical='center')
ws.cell(row=3, column=kpi_label_col).number_format = NUM_FMT_USD
ws.cell(row=3, column=kpi_label_col).fill = PatternFill(
    'solid', fgColor=TOTAL_BG)

# 表头（第 5 行）
header_row = 5
headers = ['月份'] + ITEMS + ['本月合计']
for i, h in enumerate(headers, start=2):
    c = ws.cell(row=header_row, column=i, value=h)
    c.font = Font(name='Helvetica Neue', size=11, bold=True, color=TEXT2)
    c.fill = PatternFill('solid', fgColor=TH_BG)
    c.alignment = Alignment(
        horizontal='left' if i == 2 else 'right',
        vertical='center'
    )
    c.border = Border(bottom=thin)

# 12 个月数据行
for m_idx, month in enumerate(MONTHS):
    r = header_row + 1 + m_idx  # 6 ~ 17
    # 月份
    mc = ws.cell(row=r, column=2, value=month)
    mc.font = Font(name='Helvetica Neue', size=12, color=TEXT2)
    mc.alignment = Alignment(horizontal='left', vertical='center')

    # 款项输入格
    for i in range(n_items):
        col = 3 + i  # C, D, E, F, G ...
        cell = ws.cell(row=r, column=col)
        cell.fill = PatternFill('solid', fgColor=INP_BG)
        cell.font = Font(name='Helvetica Neue', size=12, color=TEXT1)
        cell.alignment = Alignment(horizontal='right', vertical='center')
        cell.number_format = NUM_FMT_USD

    # 月度合计
    first_col_letter = get_column_letter(3)
    last_item_col_letter = get_column_letter(2 + n_items)
    total_cell = ws.cell(
        row=r, column=total_col_idx,
        value=f'=SUM({first_col_letter}{r}:{last_item_col_letter}{r})'
    )
    total_cell.font = Font(name='Helvetica Neue', size=12, bold=True,
                           color=POSITIVE)
    total_cell.alignment = Alignment(horizontal='right', vertical='center')
    total_cell.number_format = NUM_FMT_USD

    ws.row_dimensions[r].height = 30

# 年度合计行
total_row = header_row + 13  # 18
ws.cell(row=total_row, column=2, value='年度合计')
ws.cell(row=total_row, column=2).font = Font(
    name='Helvetica Neue', size=12, bold=True, color=TEXT1)
ws.cell(row=total_row, column=2).alignment = Alignment(
    horizontal='left', vertical='center')
ws.cell(row=total_row, column=2).fill = PatternFill('solid', fgColor=TOTAL_BG)
ws.cell(row=total_row, column=2).border = Border(top=thin)

for i in range(n_items + 1):
    col = 3 + i
    col_letter = get_column_letter(col)
    cell = ws.cell(row=total_row, column=col,
                   value=f'=SUM({col_letter}{header_row+1}:{col_letter}{header_row+12})')
    cell.font = Font(name='Helvetica Neue', size=12, bold=True,
                     color=POSITIVE)
    cell.alignment = Alignment(horizontal='right', vertical='center')
    cell.fill = PatternFill('solid', fgColor=TOTAL_BG)
    cell.border = Border(top=thin)
    cell.number_format = NUM_FMT_USD

ws.row_dimensions[total_row].height = 34

# 列宽
ws.column_dimensions['A'].width = 3
ws.column_dimensions['B'].width = 14
for i in range(n_items):
    ws.column_dimensions[get_column_letter(3 + i)].width = 18
ws.column_dimensions[total_col_letter].width = 18

# 行高
ws.row_dimensions[2].height = 20
ws.row_dimensions[3].height = 36
ws.row_dimensions[4].height = 16
ws.row_dimensions[header_row].height = 28

# 冻结表头
ws.freeze_panes = f'C{header_row+1}'

# 备注区
note_row = total_row + 3
ws.cell(row=note_row, column=2, value='备注 / NOTES')
ws.cell(row=note_row, column=2).font = Font(
    name='Helvetica Neue', size=10, color=TEXT3, bold=True)

out = '/home/user/cashflow-lab/google-sheets/cashflow-minimal.xlsx'
wb.save(out)
print(f'Saved: {out}')
