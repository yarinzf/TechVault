export const dashboardStats = [
    { id: 'abandoned', label: 'עגלות נטושות', value: '31%', caption: 'שיעור נטישה', delta: '+5%', deltaTone: 'danger', icon: 'cart', tone: 'amber' },
    { id: 'customers', label: 'לקוחות חדשים', value: '286', caption: 'החודש', delta: '+12.3%', deltaTone: 'success', icon: 'users', tone: 'violet' },
    { id: 'conversion', label: 'יחס המרה', value: '4.8%', caption: 'מאתמול', delta: '-1.4%', deltaTone: 'danger', icon: 'chart', tone: 'red' },
    { id: 'orders', label: 'הזמנות פתוחות', value: '15', caption: 'דורשות טיפול', delta: '+5', deltaTone: 'neutral', icon: 'box', tone: 'violet' },
    { id: 'today', label: 'מכירות היום', value: '₪22,816', caption: 'היום', delta: '+23.4%', deltaTone: 'success', icon: 'trend', tone: 'green' },
    { id: 'monthly', label: 'הכנסות החודש', value: '₪10.2M', caption: 'החודש', delta: '+18.2%', deltaTone: 'success', icon: 'shekel', tone: 'blue' },
];

export const pendingActions = [
    { id: 'return', title: 'טפל בהחזרה', description: 'הזמנה #ORD-2024-2808 - לקוח ביקש החזרה', meta: 'דחוף', tone: 'danger' },
    { id: 'stock', title: 'עדכן מלאי', description: 'מוצר "AirPods Pro 2" נגמר מהמלאי. הזמן ממחסן מרכזי', meta: 'היום', tone: 'danger' },
    { id: 'orders', title: 'אשר הזמנות', description: '8 הזמנות ממתינות לאישור', meta: 'היום', tone: 'warning' },
    { id: 'coupon', title: 'צור קופון', description: 'מבצע סוף שבוע - 15% הנחה', meta: 'מחר', tone: 'violet' },
];

export const businessAlerts = [
    { id: 'price', title: 'עליית מחיר במתחרים', description: 'שיעור ההמרה עלה ל-8.2% בממוצע. גבוה ב-25% מהממוצע', time: 'לפני שעה', tone: 'danger', action: 'בדוק מוצרים בעייתיים' },
    { id: 'model', title: 'ירידה בדגם מסוים', description: 'יחס ההמרה ירד ל-4.8% בשבוע האחרון', time: 'לפני שעתיים', tone: 'warning', action: 'נתח דפי נחיתה' },
    { id: 'revenue', title: 'ירידה בהכנסות', description: 'ההכנסות ירדו ב-12% בהשוואה לאתמול', time: 'לפני שעתיים', tone: 'warning', action: 'השווה תנועה' },
    { id: 'cart', title: 'עלייה בעגלות נטושות', description: 'שיעור הנטישה הגיע ל-31%', time: 'לפני 3 שעות', tone: 'danger', action: 'שלח תזכורות' },
    { id: 'campaign', title: 'צורך במבצע נקודתי', description: 'ירידה של 5.2% במכירות מחשבים ניידים', time: 'לפני שעה', tone: 'violet', action: 'שקול מבצע' },
];

export const topProducts = [
    {
        id: 'airpods', name: 'AirPods Pro 3', revenue: '₪309,000', sales: '206 מכירות', change: '+23.4%',
        imageUrl: 'https://images.unsplash.com/photo-1606841837239-c5a1a4a07af7?w=200&q=80', image: 'AP',
        tone: 'danger', alert: 'מלאי מוצר אזל - מומלץ להזמין מהספק', action: 'הזמן מהספק עכשיו',
    },
    {
        id: 'logitech', name: 'Logitech G502X Lightspeed', revenue: '₪67,500', sales: '180 מכירות', change: '+18.2%',
        imageUrl: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=200&q=80', image: 'LG',
    },
    {
        id: 'macbook', name: 'MacBook Pro M3 16"', revenue: '₪1,500,000', sales: '120 מכירות', change: '-5.2%',
        imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=200&q=80', image: 'MB',
        tone: 'warning', alert: 'ירידה בביקושים - הכנס מבצע', action: 'צור מבצע',
    },
    {
        id: 'playstation', name: 'Sony PlayStation 5 Slim 1TB', revenue: '₪229,932', sales: '108 מכירות', change: '+37.4%',
        imageUrl: 'https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=200&q=80', image: 'PS',
        tone: 'violet', alert: 'ביקושים מצוינים - הזדמנות להגדלת רווח', action: 'צור מבצע',
    },
    {
        id: 'razer', name: 'Razer BlackWidow V3', revenue: '₪47,900', sales: '100 מכירות', change: '+8.9%',
        imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=200&q=80', image: 'RZ',
    },
];

export const kpis = [
    { id: 'conversion', label: 'יחס המרה', current: '4.8%', target: '5.5%', progress: 87, tone: 'warning', icon: 'trend' },
    { id: 'orders', label: 'כמות הזמנות', current: '1,342', target: '1,500', progress: 89, tone: 'green', icon: 'box' },
    { id: 'revenue', label: 'הכנסה חודשית', current: '₪10.2M', target: '₪13.5M', progress: 76, tone: 'blue', icon: 'shekel' },
    { id: 'customers', label: 'לקוחות חדשים', current: '286', target: '350', progress: 82, tone: 'violet', icon: 'users' },
    { id: 'abandoned', label: 'עגלות נטושות', current: '31%', target: '40%', progress: 78, tone: 'red', icon: 'cart' },
    { id: 'returns', label: 'ביטולים', current: '5.1%', target: '5%', progress: 92, tone: 'red', icon: 'chart' },
];

/** Chart data for the revenue widget — values in ₪K units */
export const chartData = {
    week: [
        { name: 'ראשון', current: 92, previous: 88, orders: 51 },
        { name: 'שני', current: 101, previous: 95, orders: 62 },
        { name: 'שלישי', current: 105, previous: 96, orders: 58 },
        { name: 'רביעי', current: 103, previous: 95, orders: 64 },
        { name: 'חמישי', current: 108, previous: 100, orders: 69 },
        { name: 'שישי', current: 112, previous: 104, orders: 47 },
        { name: 'שבת', current: 99, previous: 94, orders: 38 },
    ],
    month: [
        { name: '1–7', current: 380, previous: 340, orders: 195 },
        { name: '8–14', current: 420, previous: 378, orders: 212 },
        { name: '15–21', current: 445, previous: 399, orders: 228 },
        { name: '22–28', current: 410, previous: 368, orders: 205 },
    ],
    year: [
        { name: 'ינואר', current: 1250, previous: 1050, orders: 520 },
        { name: 'פברואר', current: 1380, previous: 1150, orders: 580 },
        { name: 'מרץ', current: 1420, previous: 1230, orders: 610 },
        { name: 'אפריל', current: 1350, previous: 1180, orders: 570 },
        { name: 'מאי', current: 1510, previous: 1340, orders: 640 },
        { name: 'יוני', current: 1480, previous: 1290, orders: 625 },
        { name: 'יולי', current: 1620, previous: 1450, orders: 680 },
        { name: 'אוגוסט', current: 1750, previous: 1560, orders: 720 },
        { name: 'ספטמבר', current: 1680, previous: 1490, orders: 695 },
        { name: 'אוקטובר', current: 1820, previous: 1620, orders: 740 },
        { name: 'נובמבר', current: 1950, previous: 1740, orders: 790 },
        { name: 'דצמבר', current: 2100, previous: 1880, orders: 850 },
    ],
};

/** Kept for backward-compat if anything else imports it */
export const revenueSeries = {
    current: chartData.week.map(d => d.current),
    previous: chartData.week.map(d => d.previous),
    labels: chartData.week.map(d => d.name),
};