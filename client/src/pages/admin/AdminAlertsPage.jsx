import { useState } from 'react';
import {
    Bell,
    AlertTriangle,
    TrendingDown,
    TrendingUp,
    Package,
    DollarSign,
    Search,
    CircleDot,
    Clock,
    CheckCircle2,
    X,
    ShoppingCart,
    Send,
    BarChart3,
    RefreshCw,
    Eye,
    Plus,
} from 'lucide-react';

const initialNotifications = [
    {
        id: '1',
        type: 'critical',
        category: 'stock',
        title: 'מלאי אזל',
        message: 'מוצר "אוזניות Bluetooth" נגמר מהמלאי. יש להזמין ממחסן מרכזי',
        time: 'לפני 5 דקות',
        isRead: false,
        actionable: true,
        status: 'open',
        action: 'הזמן מלאי',
    },
    {
        id: '2',
        type: 'warning',
        category: 'stock',
        title: 'מלאי נמוך',
        message: 'מוצר "כבל USB-C" - נותרו 8 יחידות בלבד. מומלץ להזמין',
        time: 'לפני 15 דקות',
        isRead: false,
        actionable: true,
        status: 'in-progress',
        action: 'צור הזמנת רכש',
    },
    {
        id: '3',
        type: 'critical',
        category: 'sales',
        title: 'ירידה חדה במכירות',
        message: 'ירידה של 35% במכירות היומיות לעומת אתמול',
        time: 'לפני 30 דקות',
        isRead: false,
        actionable: true,
        status: 'open',
        action: 'נתח נתונים',
    },
    {
        id: '4',
        type: 'success',
        category: 'sales',
        title: 'עלייה במכירות',
        message: 'מוצר "רמקול נייד" - עלייה של 150% במכירות השבוע',
        time: 'לפני שעה',
        isRead: false,
        actionable: true,
        status: 'resolved',
        action: 'הצג ניתוח',
    },
    {
        id: '5',
        type: 'warning',
        category: 'orders',
        title: 'הזמנה ממתינה',
        message: 'הזמנה #ORD-2024-156 ממתינה לטיפול למעלה מ-24 שעות',
        time: 'לפני שעתיים',
        isRead: true,
        actionable: true,
        status: 'in-progress',
        action: 'עבור להזמנה',
    },
    {
        id: '6',
        type: 'info',
        category: 'system',
        title: 'עדכון מערכת',
        message: 'גרסה חדשה של המערכת זמינה להתקנה',
        time: 'לפני 3 שעות',
        isRead: true,
        actionable: true,
        status: 'open',
        action: 'עדכן עכשיו',
    },
    {
        id: '7',
        type: 'warning',
        category: 'stock',
        title: 'סטיית מחיר',
        message: 'מוצר "מטען אלחוטי" - שינוי מחיר של 15% אצל ספק',
        time: 'לפני 4 שעות',
        isRead: true,
        actionable: true,
        status: 'resolved',
        action: 'בדוק מחירים',
    },
    {
        id: '8',
        type: 'info',
        category: 'orders',
        title: 'הזמנה חדשה',
        message: 'התקבלה הזמנה חדשה #ORD-2024-2840 ע"ס ₪4,560',
        time: 'לפני 5 שעות',
        isRead: true,
        actionable: true,
        status: 'resolved',
        action: 'הצג הזמנה',
    },
];

function getTypeIcon(type) {
    switch (type) {
        case 'critical':
            return <AlertTriangle className="w-5 h-5" />;
        case 'warning':
            return <TrendingDown className="w-5 h-5" />;
        case 'success':
            return <TrendingUp className="w-5 h-5" />;
        case 'info':
        default:
            return <Bell className="w-5 h-5" />;
    }
}

function getTypeColor(type) {
    switch (type) {
        case 'critical':
            return 'bg-[#ef4444]/10 border-[#ef4444]/20 text-[#ef4444]';
        case 'warning':
            return 'bg-[#fbbf24]/10 border-[#fbbf24]/20 text-[#fbbf24]';
        case 'success':
            return 'bg-[#10b981]/10 border-[#10b981]/20 text-[#10b981]';
        case 'info':
        default:
            return 'bg-[#3b82f6]/10 border-[#3b82f6]/20 text-[#3b82f6]';
    }
}

function getCategoryIcon(category) {
    switch (category) {
        case 'stock':
            return <Package className="w-4 h-4" />;
        case 'sales':
            return <DollarSign className="w-4 h-4" />;
        case 'orders':
            return <ShoppingCart className="w-4 h-4" />;
        default:
            return <Bell className="w-4 h-4" />;
    }
}

function getStatusIcon(status) {
    switch (status) {
        case 'open':
            return <CircleDot className="w-3.5 h-3.5" />;
        case 'in-progress':
            return <Clock className="w-3.5 h-3.5" />;
        case 'resolved':
        default:
            return <CheckCircle2 className="w-3.5 h-3.5" />;
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'open':
            return 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]';
        case 'in-progress':
            return 'bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#fbbf24]';
        case 'resolved':
        default:
            return 'bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981]';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'open':
            return 'פתוח';
        case 'in-progress':
            return 'בטיפול';
        case 'resolved':
        default:
            return 'טופל';
    }
}

function getActionView(action) {
    switch (action) {
        case 'הזמן מלאי':
            return 'order-stock';
        case 'צור הזמנת רכש':
            return 'create-purchase';
        case 'נתח נתונים':
        case 'הצג ניתוח':
            return 'analyze-data';
        case 'עדכן עכשיו':
            return 'update-system';
        case 'עבור להזמנה':
        case 'הצג הזמנה':
            return 'view-order';
        case 'בדוק מחירים':
            return 'check-prices';
        default:
            return null;
    }
}

export default function AdminAlertsPage() {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedType, setSelectedType] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [notificationsList, setNotificationsList] = useState(initialNotifications);
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [activeActionView, setActiveActionView] = useState(null);

    const markAsRead = (id) => {
        setNotificationsList((prev) =>
            prev.map((notification) =>
                notification.id === id ? { ...notification, isRead: true } : notification
            )
        );
    };

    const markAllAsRead = () => {
        setNotificationsList((prev) =>
            prev.map((notification) => ({ ...notification, isRead: true }))
        );
    };

    const deleteNotification = (id) => {
        setNotificationsList((prev) => prev.filter((notification) => notification.id !== id));

        if (selectedNotification?.id === id) {
            setSelectedNotification(null);
            setActiveActionView(null);
        }
    };

    const resolveSelectedNotification = () => {
        if (!selectedNotification) return;

        setNotificationsList((prev) =>
            prev.map((notification) =>
                notification.id === selectedNotification.id
                    ? { ...notification, status: 'resolved', isRead: true }
                    : notification
            )
        );

        setSelectedNotification((prev) =>
            prev ? { ...prev, status: 'resolved', isRead: true } : prev
        );
    };

    const openNotification = (notification) => {
        setSelectedNotification(notification);
        setActiveActionView(null);
        markAsRead(notification.id);
    };

    const openActionView = (notification) => {
        setSelectedNotification(notification);
        markAsRead(notification.id);
        setActiveActionView(getActionView(notification.action));
    };

    const filteredNotifications = notificationsList.filter((notification) => {
        const matchesCategory =
            selectedCategory === 'all' || notification.category === selectedCategory;
        const matchesType = selectedType === 'all' || notification.type === selectedType;
        const matchesStatus = selectedStatus === 'all' || notification.status === selectedStatus;
        const matchesSearch =
            notification.title.includes(searchTerm) || notification.message.includes(searchTerm);

        return matchesCategory && matchesType && matchesStatus && matchesSearch;
    });

    const unreadCount = notificationsList.filter((notification) => !notification.isRead).length;

    return (
        <div className="p-8" dir="rtl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl text-foreground mb-2">התראות</h1>
                    <p className="text-muted-foreground">
                        מעקב אחר כל האירועים והעדכונים במערכת • {unreadCount} התראות חדשות
                    </p>
                </div>

                <button
                    type="button"
                    onClick={markAllAsRead}
                    className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg hover:bg-secondary/70 transition-colors"
                >
                    <CheckCircle2 className="w-4 h-4" />
                    סמן הכל כנקרא
                </button>
            </div>

            <StatsCards notifications={notificationsList} />

            <div className="bg-card border border-border rounded-lg p-4 mb-6">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="חיפוש התראות..."
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="w-full bg-secondary border border-border rounded-lg pl-4 pr-10 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
                        />
                    </div>

                    <FilterSelect
                        value={selectedCategory}
                        onChange={setSelectedCategory}
                        options={[
                            ['all', 'כל הקטגוריות'],
                            ['stock', 'מלאי'],
                            ['sales', 'מכירות'],
                            ['orders', 'הזמנות'],
                            ['system', 'מערכת'],
                        ]}
                    />

                    <FilterSelect
                        value={selectedType}
                        onChange={setSelectedType}
                        options={[
                            ['all', 'כל הסוגים'],
                            ['critical', 'קריטי'],
                            ['warning', 'אזהרה'],
                            ['info', 'מידע'],
                            ['success', 'הצלחה'],
                        ]}
                    />

                    <FilterSelect
                        value={selectedStatus}
                        onChange={setSelectedStatus}
                        options={[
                            ['all', 'כל הסטטוסים'],
                            ['open', 'פתוח'],
                            ['in-progress', 'בטיפול'],
                            ['resolved', 'טופל'],
                        ]}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-400px)] scrollbar-thin">
                    {filteredNotifications.map((notification) => (
                        <NotificationCard
                            key={notification.id}
                            notification={notification}
                            selected={selectedNotification?.id === notification.id}
                            onOpen={() => openNotification(notification)}
                            onAction={() => openActionView(notification)}
                            onDelete={() => deleteNotification(notification.id)}
                        />
                    ))}

                    {filteredNotifications.length === 0 && (
                        <div className="bg-card border border-border rounded-lg p-8 text-center">
                            <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                            <p className="text-sm text-foreground mb-1">אין התראות</p>
                            <p className="text-xs text-muted-foreground">
                                כל ההתראות נקראו או לא נמצאו התאמות לחיפוש
                            </p>
                        </div>
                    )}
                </div>

                <div className="bg-card border border-border rounded-lg p-6 sticky top-8 h-fit min-h-[400px] overflow-y-auto max-h-[calc(100vh-200px)] scrollbar-thin">
                    {!selectedNotification ? (
                        <EmptyDetails />
                    ) : activeActionView ? (
                        <ActionView
                            actionView={activeActionView}
                            notification={selectedNotification}
                            onBack={() => setActiveActionView(null)}
                        />
                    ) : (
                        <NotificationDetails
                            notification={selectedNotification}
                            onClose={() => {
                                setSelectedNotification(null);
                                setActiveActionView(null);
                            }}
                            onAction={() => setActiveActionView(getActionView(selectedNotification.action))}
                            onResolve={resolveSelectedNotification}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function StatsCards({ notifications }) {
    const cards = [
        {
            label: 'קריטי',
            type: 'critical',
            color: '#ef4444',
            icon: <AlertTriangle className="w-6 h-6 text-[#ef4444]/30" />,
        },
        {
            label: 'אזהרה',
            type: 'warning',
            color: '#fbbf24',
            icon: <TrendingDown className="w-6 h-6 text-[#fbbf24]/30" />,
        },
        {
            label: 'הצלחה',
            type: 'success',
            color: '#10b981',
            icon: <TrendingUp className="w-6 h-6 text-[#10b981]/30" />,
        },
        {
            label: 'מידע',
            type: 'info',
            color: '#3b82f6',
            icon: <Bell className="w-6 h-6 text-[#3b82f6]/30" />,
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            {cards.map((card) => (
                <div
                    key={card.type}
                    className="border rounded-lg p-3"
                    style={{
                        backgroundColor: `${card.color}0d`,
                        borderColor: `${card.color}33`,
                    }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground mb-0.5">{card.label}</p>
                            <p className="text-xl" style={{ color: card.color }}>
                                {notifications.filter((item) => item.type === card.type && !item.isRead).length}
                            </p>
                        </div>
                        {card.icon}
                    </div>
                </div>
            ))}
        </div>
    );
}

function FilterSelect({ value, onChange, options }) {
    return (
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
        >
            {options.map(([optionValue, label]) => (
                <option key={optionValue} value={optionValue}>
                    {label}
                </option>
            ))}
        </select>
    );
}

function NotificationCard({ notification, selected, onOpen, onAction, onDelete }) {
    return (
        <article
            onClick={onOpen}
            className={`bg-card border rounded-lg p-3 transition-all hover:shadow-md cursor-pointer ${selected
                    ? 'border-[#2563eb] shadow-sm shadow-[#2563eb]/10'
                    : notification.isRead
                        ? 'border-border opacity-70'
                        : 'border-[#2563eb]/30 shadow-sm shadow-[#2563eb]/5'
                }`}
        >
            <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg border ${getTypeColor(notification.type)}`}>
                    {getTypeIcon(notification.type)}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="text-sm text-foreground font-medium">{notification.title}</h3>

                                {!notification.isRead && (
                                    <span className="w-1.5 h-1.5 bg-[#2563eb] rounded-full" />
                                )}

                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${getStatusColor(notification.status)}`}>
                                    {getStatusIcon(notification.status)}
                                    {getStatusText(notification.status)}
                                </span>

                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    {getCategoryIcon(notification.category)}
                                </span>
                            </div>

                            <p className="text-xs text-muted-foreground line-clamp-2">
                                {notification.message}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onDelete();
                            }}
                            className="p-1 rounded-md hover:bg-secondary transition-colors"
                            aria-label="מחיקת התראה"
                        >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">{notification.time}</span>

                        {notification.actionable && notification.action && (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onAction();
                                }}
                                className="text-xs text-[#2563eb] hover:text-[#2563eb]/80 border border-[#2563eb]/30 hover:border-[#2563eb]/50 bg-[#2563eb]/5 hover:bg-[#2563eb]/10 px-2.5 py-1 rounded-md transition-all"
                            >
                                {notification.action} →
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

function EmptyDetails() {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="mb-6 opacity-40">
                <path d="M60 10L85 35L60 60L35 35L60 10Z" fill="#2563eb" fillOpacity="0.2" />
                <path d="M60 60L85 85L60 110L35 85L60 60Z" fill="#2563eb" fillOpacity="0.3" />
                <path d="M10 60L35 85L60 60L35 35L10 60Z" fill="#2563eb" fillOpacity="0.25" />
                <path d="M85 35L110 60L85 85L60 60L85 35Z" fill="#2563eb" fillOpacity="0.25" />
            </svg>
            <p className="text-foreground text-lg mb-1">לא נבחרה התראה</p>
            <p className="text-muted-foreground text-sm text-center">
                בחר התראה מהרשימה כדי לראות פרטים
            </p>
        </div>
    );
}

function NotificationDetails({ notification, onClose, onAction, onResolve }) {
    return (
        <div>
            <div className="flex items-start justify-between mb-6 pb-4 border-b border-border">
                <div className="flex items-start gap-3 flex-1">
                    <div className={`p-3 rounded-lg border ${getTypeColor(notification.type)}`}>
                        {getTypeIcon(notification.type)}
                    </div>

                    <div className="flex-1">
                        <h2 className="text-xl text-foreground mb-2">{notification.title}</h2>

                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${getStatusColor(notification.status)}`}>
                                {getStatusIcon(notification.status)}
                                {getStatusText(notification.status)}
                            </span>
                            <span className="text-xs text-muted-foreground">{notification.time}</span>
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="p-2 hover:bg-secondary rounded-lg transition-colors"
                    aria-label="סגור"
                >
                    <X className="w-4 h-4 text-muted-foreground" />
                </button>
            </div>

            <div className="mb-6">
                <h3 className="text-sm text-muted-foreground mb-2">פרטי ההתראה</h3>
                <p className="text-sm text-foreground leading-relaxed">{notification.message}</p>
            </div>

            {notification.actionable && notification.action && (
                <div className="bg-secondary/30 border border-border rounded-lg p-4 mb-6">
                    <h3 className="text-sm text-foreground font-medium mb-3">פעולות נדרשות</h3>
                    <ActionChecklist notification={notification} />
                </div>
            )}

            <div className="space-y-2">
                {notification.actionable && notification.action && (
                    <button
                        type="button"
                        onClick={onAction}
                        className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-medium hover:bg-[#2563eb]/90 transition-colors flex items-center justify-center gap-2"
                    >
                        {notification.action}
                    </button>
                )}

                <button
                    type="button"
                    onClick={onResolve}
                    className="w-full bg-secondary border border-border text-foreground py-2.5 rounded-lg hover:bg-secondary/70 transition-colors text-sm"
                >
                    סמן כטופל
                </button>
            </div>
        </div>
    );
}

function ActionChecklist({ notification }) {
    let items = [];

    if (notification.type === 'critical' && notification.category === 'stock') {
        items = ['בדוק זמינות אצל ספקים', 'צור הזמנת רכש חדשה', 'עדכן מלאי במערכת'];
    } else if (notification.type === 'warning' && notification.category === 'stock') {
        items = ['עדכן כמות מינימום למוצר', 'שלח התראה לספק'];
    } else if (notification.category === 'sales') {
        items = ['בדוק דוחות מכירות', 'נתח מגמות שוק'];
    } else if (notification.category === 'orders') {
        items = ['פתח דף הזמנה', 'עדכן סטטוס משלוח'];
    } else {
        items = ['בדוק את פרטי ההתראה', 'עדכן סטטוס במערכת'];
    }

    return (
        <div className="space-y-2">
            {items.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 bg-[#2563eb] rounded-full" />
                    <span>{item}</span>
                </div>
            ))}
        </div>
    );
}

function ActionView({ actionView, notification, onBack }) {
    if (actionView === 'order-stock') {
        return (
            <ActionShell
                onBack={onBack}
                icon={<ShoppingCart className="w-6 h-6 text-[#2563eb]" />}
                iconBg="bg-[#2563eb]/10"
                title="הזמנת מלאי"
                subtitle="אוזניות Bluetooth"
            >
                <StockSummary current="0 יחידות" currentColor="#ef4444" secondaryLabel="ממוצע מכירות יומי" secondaryValue="12 יחידות" />
                <ActionInput label="כמות להזמנה" type="number" defaultValue="100" />
                <ActionInput label="מחיר ליחידה" defaultValue="₪89" />
                <TotalBox total="₪8,900" />
                <ActionSelect label="ספק" options={['ספק ראשי - זמן אספקה 3 ימים', 'ספק משני - זמן אספקה 7 ימים', 'ספק חלופי - זמן אספקה 5 ימים']} />
                <ActionSelect label="עדיפות" options={['דחוף - 24 שעות', 'גבוהה - 3 ימים', 'רגילה - שבוע']} />

                <div>
                    <label className="block text-xs text-muted-foreground mb-2">הערות להזמנה</label>
                    <textarea
                        rows={3}
                        placeholder="הערות נוספות..."
                        className="w-full bg-input-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-[#2563eb] focus:outline-none transition-colors resize-none"
                    />
                </div>

                <PrimaryAction icon={<Send className="w-4 h-4" />}>שלח הזמנה לספק</PrimaryAction>
            </ActionShell>
        );
    }

    if (actionView === 'create-purchase') {
        return (
            <ActionShell
                onBack={onBack}
                icon={<Package className="w-6 h-6 text-[#fbbf24]" />}
                iconBg="bg-[#fbbf24]/10"
                title="הזמנת רכש חדשה"
                subtitle="כבל USB-C"
            >
                <StockSummary current="8 יחידות" currentColor="#fbbf24" secondaryLabel="כמות מומלצת" secondaryValue="50 יחידות" />
                <ActionInput label="כמות" type="number" defaultValue="50" />
                <ActionInput label="מחיר ליחידה" defaultValue="₪25" />
                <TotalBox total="₪1,250" />
                <PrimaryAction icon={<Plus className="w-4 h-4" />}>צור הזמנת רכש</PrimaryAction>
            </ActionShell>
        );
    }

    if (actionView === 'analyze-data') {
        return <AnalyzeDataView notification={notification} onBack={onBack} />;
    }

    if (actionView === 'update-system') {
        return <UpdateSystemView onBack={onBack} />;
    }

    if (actionView === 'view-order') {
        return <ViewOrderView onBack={onBack} />;
    }

    if (actionView === 'check-prices') {
        return <CheckPricesView onBack={onBack} />;
    }

    return null;
}

function ActionShell({ onBack, icon, iconBg, title, subtitle, children }) {
    return (
        <div>
            <div className="relative mb-6 pb-4 border-b border-border/50">
                <button
                    type="button"
                    onClick={onBack}
                    className="absolute top-0 right-0 text-xs text-[#2563eb] hover:text-[#2563eb]/80 transition-colors"
                >
                    ← חזרה לפרטי ההתראה
                </button>

                <div className="text-center mt-8">
                    <div className={`w-12 h-12 ${iconBg} rounded-full flex items-center justify-center mx-auto mb-3`}>
                        {icon}
                    </div>
                    <h2 className="text-xl text-foreground mb-1">{title}</h2>
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                </div>
            </div>

            <div className="space-y-4">{children}</div>
        </div>
    );
}

function StockSummary({ current, currentColor, secondaryLabel, secondaryValue }) {
    return (
        <div className="bg-secondary/20 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">מלאי נוכחי</span>
                <span className="text-lg font-medium" style={{ color: currentColor }}>
                    {current}
                </span>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{secondaryLabel}</span>
                <span className="text-sm text-foreground">{secondaryValue}</span>
            </div>
        </div>
    );
}

function ActionInput({ label, type = 'text', defaultValue }) {
    return (
        <div>
            <label className="block text-xs text-muted-foreground mb-2">{label}</label>
            <input
                type={type}
                defaultValue={defaultValue}
                className="w-full bg-input-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-[#2563eb] focus:outline-none transition-colors"
            />
        </div>
    );
}

function ActionSelect({ label, options }) {
    return (
        <div>
            <label className="block text-xs text-muted-foreground mb-2">{label}</label>
            <select className="w-full bg-input-background border border-border rounded-lg px-4 py-2.5 text-foreground focus:border-[#2563eb] focus:outline-none transition-colors">
                {options.map((option) => (
                    <option key={option}>{option}</option>
                ))}
            </select>
        </div>
    );
}

function TotalBox({ total }) {
    return (
        <div className="bg-[#2563eb]/5 border border-[#2563eb]/20 rounded-lg p-3">
            <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">סה"כ הזמנה</span>
                <span className="text-xl text-[#2563eb] font-medium">{total}</span>
            </div>
        </div>
    );
}

function PrimaryAction({ icon, children }) {
    return (
        <button
            type="button"
            className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-medium hover:bg-[#2563eb]/90 transition-colors flex items-center justify-center gap-2"
        >
            {icon}
            {children}
        </button>
    );
}

function AnalyzeDataView({ notification, onBack }) {
    const isSuccess = notification.type === 'success';

    return (
        <ActionShell
            onBack={onBack}
            icon={<BarChart3 className={`w-6 h-6 ${isSuccess ? 'text-[#10b981]' : 'text-[#ef4444]'}`} />}
            iconBg={isSuccess ? 'bg-[#10b981]/10' : 'bg-[#ef4444]/10'}
            title="ניתוח נתוני מכירות"
            subtitle={isSuccess ? 'עלייה של 150% במכירות' : 'ירידה של 35% במכירות'}
        >
            <div className="grid grid-cols-2 gap-3">
                <MetricBox label={isSuccess ? 'השבוע שעבר' : 'מכירות אתמול'} value={isSuccess ? '₪8,200' : '₪18,450'} />
                <MetricBox label={isSuccess ? 'השבוע הנוכחי' : 'מכירות היום'} value={isSuccess ? '₪20,500' : '₪11,993'} color={isSuccess ? '#10b981' : '#ef4444'} />
            </div>

            <InsightBox
                title="ממצאים עיקריים"
                items={
                    isSuccess
                        ? ['עלייה חדה במכירות רמקולים ניידים', 'גידול של 60% בתנועה לדף המוצר', 'ביקורות חיוביות מעולות - 4.8 כוכבים']
                        : ['ירידה חדה במכירות קטגוריית אלקטרוניקה', 'פחות תנועה באתר - 40% פחות מבקרים', 'קטגוריית אופנה עדיין יציבה']
                }
                color={isSuccess ? '#10b981' : '#ef4444'}
            />

            <InsightBox
                title="המלצות לפעולה"
                items={
                    isSuccess
                        ? ['הגדל מלאי - הביקוש גבוה', 'שקול להציג מוצרים דומים', 'צור מבצע קומבינציה עם אביזרים']
                        : ['הפעל מבצע בקטגוריית אלקטרוניקה', 'שלח ניוזלטר ללקוחות', 'בדוק תקלות טכניות באתר']
                }
                color={isSuccess ? '#10b981' : '#2563eb'}
                tinted
            />

            <PrimaryAction icon={<Eye className="w-4 h-4" />}>הצג דוח מפורט</PrimaryAction>
        </ActionShell>
    );
}

function MetricBox({ label, value, color = undefined }) {
    return (
        <div className="bg-secondary/20 border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-xl" style={{ color: color || undefined }}>
                {value}
            </p>
        </div>
    );
}

function InsightBox({ title, items, color, tinted = false }) {
    return (
        <div
            className={`border rounded-lg p-4 ${tinted ? '' : 'bg-secondary/20 border-border'}`}
            style={tinted ? { backgroundColor: `${color}0d`, borderColor: `${color}33` } : undefined}
        >
            <h3 className="text-sm text-foreground font-medium mb-3">{title}</h3>

            <div className="space-y-2">
                {items.map((item) => (
                    <div key={item} className="flex items-start gap-2">
                        <span
                            className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                            style={{ backgroundColor: color }}
                        />
                        <p className="text-xs text-muted-foreground">{item}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function UpdateSystemView({ onBack }) {
    return (
        <ActionShell
            onBack={onBack}
            icon={<RefreshCw className="w-6 h-6 text-[#3b82f6]" />}
            iconBg="bg-[#3b82f6]/10"
            title="עדכון מערכת"
            subtitle="גרסה 2.5.0 זמינה"
        >
            <InsightBox
                title="מה חדש בגרסה זו?"
                items={['שיפורי ביצועים במערכת המלאי', 'תיקוני באגים בדוחות', 'ממשק משופר למסך ניהול קמפיינים']}
                color="#10b981"
            />

            <div className="bg-[#fbbf24]/5 border border-[#fbbf24]/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#fbbf24] mt-0.5" />
                    <div>
                        <p className="text-xs text-foreground font-medium mb-1">שים לב</p>
                        <p className="text-xs text-muted-foreground">
                            העדכון ייקח כ-5 דקות. המערכת תהיה זמינה במהלך העדכון.
                        </p>
                    </div>
                </div>
            </div>

            <PrimaryAction icon={<RefreshCw className="w-4 h-4" />}>התחל עדכון</PrimaryAction>
        </ActionShell>
    );
}

function ViewOrderView({ onBack }) {
    return (
        <ActionShell
            onBack={onBack}
            icon={<ShoppingCart className="w-6 h-6 text-[#fbbf24]" />}
            iconBg="bg-[#fbbf24]/10"
            title="פרטי הזמנה"
            subtitle="#ORD-2024-2840"
        >
            <div className="grid grid-cols-2 gap-3">
                <MetricBox label="סכום הזמנה" value="₪4,560" color="#2563eb" />
                <MetricBox label="סטטוס" value="ממתין לטיפול" color="#fbbf24" />
            </div>

            <InfoPanel title="פרטי לקוח" lines={['יוסי כהן', 'yossi@example.com', '050-1234567']} />
            <InfoPanel title="מוצרים בהזמנה" lines={['אוזניות Bluetooth × 2 — ₪1,200', 'כבל USB-C × 5 — ₪360', 'רמקול נייד × 1 — ₪3,000']} />

            <PrimaryAction icon={<CheckCircle2 className="w-4 h-4" />}>אשר ועבד הזמנה</PrimaryAction>
        </ActionShell>
    );
}

function CheckPricesView({ onBack }) {
    return (
        <ActionShell
            onBack={onBack}
            icon={<DollarSign className="w-6 h-6 text-[#fbbf24]" />}
            iconBg="bg-[#fbbf24]/10"
            title="השוואת מחירים"
            subtitle="מטען אלחוטי"
        >
            <MetricBox label="המחיר הנוכחי שלך" value="₪89" />

            <div className="space-y-2">
                <h3 className="text-sm text-foreground font-medium mb-2">מחירי ספקים</h3>
                <SupplierPrice name="ספק A" price="₪76" note="חיסכון של 15% • זמן אספקה: 5 ימים" color="#10b981" />
                <SupplierPrice name="ספק B" price="₪85" note="חיסכון של 4% • זמן אספקה: 3 ימים" color="#f9fafb" />
                <SupplierPrice name="ספק C" price="₪102" note="יקר ב-15% • זמן אספקה: 2 ימים" color="#ef4444" />
            </div>

            <PrimaryAction>עדכן מחיר למוצר</PrimaryAction>
        </ActionShell>
    );
}

function InfoPanel({ title, lines }) {
    return (
        <div className="bg-secondary/20 border border-border rounded-lg p-4">
            <h3 className="text-sm text-foreground font-medium mb-3">{title}</h3>
            <div className="space-y-1">
                {lines.map((line) => (
                    <p key={line} className="text-xs text-muted-foreground">
                        {line}
                    </p>
                ))}
            </div>
        </div>
    );
}

function SupplierPrice({ name, price, note, color }) {
    return (
        <div
            className="border rounded-lg p-3"
            style={{
                backgroundColor: color === '#f9fafb' ? undefined : `${color}0d`,
                borderColor: color === '#f9fafb' ? undefined : `${color}33`,
            }}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-foreground">{name}</span>
                <span className="text-lg" style={{ color }}>
                    {price}
                </span>
            </div>
            <p className="text-xs text-muted-foreground">{note}</p>
        </div>
    );
}
