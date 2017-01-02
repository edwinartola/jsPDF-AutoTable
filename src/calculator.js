import {Config, FONT_ROW_RATIO} from './config.js';
import {getStringWidth, ellipsize} from './common.js';

/**
 * Calculate the column widths
 */
export function calculateWidths(doc, pageWidth) {
    
    let table = Config.tableInstance();

    // Column and table content width
    let fixedWidth = 0;
    let autoWidth = 0;
    let dynamicColumns = [];
    table.columns.forEach(function (column) {
        column.contentWidth = 0;
        table.rows.concat(table.headerRow).forEach(function (row) {
            let cell = row.cells[column.dataKey];
            let hpadding = cell.styles.cellPadding.left + cell.styles.cellPadding.right;
            cell.contentWidth = hpadding + getStringWidth(cell.text, cell.styles);
            if (cell.contentWidth > column.contentWidth) {
                column.contentWidth = cell.contentWidth;
            }
        });
        table.contentWidth += column.contentWidth;
        if (typeof column.widthStyle === 'number') {
            column.preferredWidth = column.widthStyle;
            fixedWidth += column.preferredWidth;
            column.width = column.preferredWidth;
        } else if (column.widthStyle === 'wrap') {
            column.preferredWidth = column.contentWidth;
            fixedWidth += column.preferredWidth;
            column.width = column.preferredWidth;
        } else {
            column.preferredWidth = column.contentWidth;
            autoWidth += column.contentWidth;
            dynamicColumns.push(column);
        }
        table.preferredWidth += column.preferredWidth;
    });

    let settings = Config.settings();
    if (typeof settings.tableWidth === 'number') {
        table.width = settings.tableWidth;
    } else if (settings.tableWidth === 'wrap') {
        table.width = table.preferredWidth;
    } else {
        table.width = pageWidth - settings.margin.left - settings.margin.right;
    }

    distributeWidth(dynamicColumns, fixedWidth, autoWidth, 0);

    // Row height, table height and text overflow
    let all = table.rows.concat(table.headerRow);
    all.forEach(function (row, i) {
        let maxCellHeight = 0;
        table.columns.forEach(function (col) {
            let cell = row.cells[col.dataKey];

            Config.applyStyles(cell.styles);
            let textSpace = col.width - cell.styles.cellPadding.left - cell.styles.cellPadding.right;
            if (cell.styles.overflow === 'linebreak') {
                // Add one pt to textSpace to fix rounding error
                try {
                    cell.text = doc.splitTextToSize(cell.text, textSpace + 1, {fontSize: cell.styles.fontSize});
                } catch(e) {
                    if (e instanceof TypeError && Array.isArray(cell.text)) {
                        cell.text = doc.splitTextToSize(cell.text.join(' '), textSpace + 1, {fontSize: cell.styles.fontSize});
                    } else {
                        throw e;
                    }
                }
            } else if (cell.styles.overflow === 'ellipsize') {
                cell.text = ellipsize(cell.text, textSpace, cell.styles);
            } else if (cell.styles.overflow === 'visible') {
                // Do nothing
            } else if (cell.styles.overflow === 'hidden') {
                cell.text = ellipsize(cell.text, textSpace, cell.styles, '');
            } else if (typeof cell.styles.overflow === 'function') {
                cell.text = cell.styles.overflow(cell.text, textSpace);
            } else {
                console.error("Unrecognized overflow type: " + cell.styles.overflow);
            }

            let k = Config.getJspdfInstance().internal.scaleFactor;
            let lineCount = Array.isArray(cell.text) ? cell.text.length : 1;
            let fontHeight = cell.styles.fontSize / k * FONT_ROW_RATIO;
            let vpadding = cell.styles.cellPadding.top + cell.styles.cellPadding.bottom;
            let contentHeight = vpadding + fontHeight;
            let vextra = contentHeight > row.heightStyle ? vpadding : row.heightStyle - fontHeight;
            cell.contentHeight = lineCount * fontHeight + vextra;
            if (cell.contentHeight > maxCellHeight) {
                maxCellHeight = cell.contentHeight;
            }
        });

        row.height = maxCellHeight;
        table.height += row.height;
    });
}

function distributeWidth(dynamicColumns, staticWidth, dynamicColumnsContentWidth, fairWidth) {
    let table = Config.tableInstance();
    let extraWidth = table.width - staticWidth - dynamicColumnsContentWidth;
    for (let i = 0; i < dynamicColumns.length; i++) {
        let col = dynamicColumns[i];
        let ratio = col.contentWidth / dynamicColumnsContentWidth;
        // A column turned out to be none dynamic, start over recursively
        let isNoneDynamic = col.contentWidth + extraWidth * ratio < fairWidth;
        if (extraWidth < 0 && isNoneDynamic) {
            dynamicColumns.splice(i, 1);
            dynamicColumnsContentWidth -= col.contentWidth;
            col.width = fairWidth;
            staticWidth += col.width;
            distributeWidth(dynamicColumns, staticWidth, dynamicColumnsContentWidth, fairWidth);
            break;
        } else {
            col.width = col.contentWidth + extraWidth * ratio;
        }
    }
}