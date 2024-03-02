"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPKs = void 0;
function formatDate(date) {
    var year = date.getFullYear();
    var month = (date.getMonth() + 1).toString();
    var day = date.getDate().toString();
    return "".concat(year, "-").concat(month, "-").concat(day);
}
function getWeek(date) {
    var firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    var pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return "".concat(date.getFullYear(), "-").concat(Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7).toString());
}
function getPKs(period, startDate, endDate) {
    var start = new Date(startDate);
    var end = new Date(endDate);
    var result = [];
    if (period === 'DAY') {
        for (var date = start; date <= end; date.setDate(date.getDate() + 1)) {
            result.push(formatDate(new Date(date)));
        }
    }
    else if (period === 'WEEK') {
        for (var date = start; date <= end; date.setDate(date.getDate() + 7)) {
            result.push(getWeek(new Date(date)));
        }
    }
    else if (period === 'MONTH') {
        for (var year = start.getFullYear(); year <= end.getFullYear(); year++) {
            for (var month = (year === start.getFullYear() ? start.getMonth() : 0); month <= (year === end.getFullYear() ? end.getMonth() : 11); month++) {
                result.push("".concat(year, "-").concat((month + 1).toString()));
            }
        }
    }
    else if (period === 'YEAR') {
        for (var year = start.getFullYear(); year <= end.getFullYear(); year++) {
            result.push("".concat(year));
        }
    }
    return result;
}
exports.getPKs = getPKs;
console.log(getPKs('WEEK', '2020-01-01', '2021-01-05'));
