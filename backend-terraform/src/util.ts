type Period = 'WEEK' | 'DAY' | 'MONTH' | 'YEAR';

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString();
    const day = date.getDate().toString();
    return `${year}-${month}-${day}`;
}

function getWeek(date: Date): string {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return `${date.getFullYear()}-${Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7).toString()}`;
}

export function getPKs(period: Period, startDate: string, endDate: string): string[] {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const result: string[] = [];

    if (period === 'DAY') {
        for (let date = start; date <= end; date.setDate(date.getDate() + 1)) {
            result.push(formatDate(new Date(date)));
        }
    } else if (period === 'WEEK') {
        for (let date = start; date <= end; date.setDate(date.getDate() + 7)) {
            result.push(getWeek(new Date(date)));
        }
    } else if (period === 'MONTH') {
        for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
            for (let month = (year === start.getFullYear() ? start.getMonth() : 0); month <= (year === end.getFullYear() ? end.getMonth() : 11); month++) {
                result.push(`${year}-${(month + 1).toString()}`);
            }
        }
    } else if (period === 'YEAR') {
        for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
            result.push(`${year}`);
        }
    }

    return result;
}

console.log(getPKs('WEEK', '2020-01-01', '2021-01-05'));