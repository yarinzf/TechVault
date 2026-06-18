import { useState } from 'react';
import {
    Search,
    Plus,
    Download,
    CheckCircle2,
    Truck,
    MoreHorizontal,
} from 'lucide-react';

const ordersData = [
    {
        id: '1',
        number: 'ORD-2024-2850',
        customer: 'יוסי כהן',
        items: 3,
        amount: '₪4,560',
        status: 'pending',
        time: 'לפני 5 דקות',
        priority: true,
    },
    {
        id: '2',
        number: 'ORD-2024-2849',
        customer: 'שרה לוי',
        items: 1,
        amount: '₪1,299',
        status: 'pending',
        time: 'לפני 12 דקות',
        priority: false,
    },
    {
        id: '3',
        number: 'ORD-2024-2848',
        customer: 'דוד אברהם',
        items: 2,
        amount: '₪2,880',
        status: 'processing',
        time: 'לפני 23 דקות',
        priority: false,
    },
    {
        id: '4',
        number: 'ORD-2024-2847',
        customer: 'מירי גולן',
        items: 5,
        amount: '₪8,920',
        status: 'processing',
        time: 'לפני שעה',
        priority: true,
    },
    {
        id: '5',
        number: 'ORD-2024-2846',
        customer: 'אבי מזרחי',
        items: 1,
        amount: '₪599',
        status: 'shipped',
        time: 'לפני 2 שעות',
        priority: false,
    },
    {
        id: '6',
        number: 'ORD-2024-2845',
        customer: 'רונית שמש',
        items: 4,
        amount: '₪6,340',
        status: 'completed',
        time: 'לפני 3 שעות',
        priority: false,
    },
    {
        id: '7',
        number: 'ORD-2024-2844',
        customer: 'משה ברק',
        items: 2,
        amount: '₪3,450',
        status: 'completed',
        time: 'לפני 4 שעות',
        priority: false,
    },
    {
        id: '8',
        number: 'ORD-2024-2843',
        customer: 'טל רוזן',
        items: 1,
        amount: '₪1,099',
        status: 'cancelled',
        time: 'לפני 5 שעות',
        priority: false,
    },
];

const stats = [
    { label: 'ממתינות לטיפול', value: 3, color: '#fbbf24' },
    { label: 'בטיפול', value: 12, color: '#3b82f6' },
    { label: 'הושלמו היום', value: 47, color: '#10b981' },
    { label: 'בוטלו', value: 2, color: '#ef4444' },
];

function getStatusBadge(status) {
    switch (status) {
        case 'pending':
            return {
                text: 'ממתינה',
                color: 'bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/20',
            };

        case 'processing':
            return {
                text: 'בטיפול',
                color: 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20',
            };

        case 'shipped':
            return {
                text: 'נשלחה',
                color: 'bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/20',
            };

        case 'completed':
            return {
                text: 'הושלמה',
                color: 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20',
            };

        case 'cancelled':
            return {
                text: 'בוטלה',
                color: 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20',
            };

        default:
            return {
                text: status,
                color: 'bg-secondary text-muted-foreground border-border',
            };
    }
}

export function OrdersQuickView() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [orders] = useState(ordersData);

    const filteredOrders = orders.filter((order) => (
        order.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer.includes(searchTerm)
    ));

    const toggleSelectAll = () => {
        if (selectedOrders.length === filteredOrders.length) {
            setSelectedOrders([]);
        } else {
            setSelectedOrders(filteredOrders.map((order) => order.id));
        }
    };

    const toggleSelect = (id) => {
        setSelectedOrders((prev) => (
            prev.includes(id)
                ? prev.filter((item) => item !== id)
                : [...prev, id]
        ));
    };

    return (
        <section className="bg-card border border-border rounded-xl p-6" dir="rtl">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl text-foreground">ניהול הזמנות</h2>

                <div className="flex gap-2">
                    <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-secondary transition-colors"
                        aria-label="ייצוא הזמנות"
                    >
                        <Download className="w-4 h-4 text-foreground" />
                    </button>

                    <button
                        type="button"
                        className="flex items-center gap-2 bg-[#2563eb] text-white px-4 py-2 rounded-lg hover:bg-[#2563eb]/90 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        הזמנה חדשה
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-6">
                {stats.map((stat) => (
                    <div key={stat.label} className="bg-secondary/30 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                        <p className="text-2xl" style={{ color: stat.color }}>
                            {stat.value}
                        </p>
                    </div>
                ))}
            </div>

            <div className="relative mb-4">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

                <input
                    type="text"
                    placeholder="חיפוש לפי מספר הזמנה או לקוח..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg pl-4 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
                />
            </div>

            {selectedOrders.length > 0 && (
                <div className="bg-[#2563eb]/5 border border-[#2563eb]/20 rounded-lg p-3 mb-4 flex items-center justify-between">
                    <span className="text-sm text-foreground">
                        {selectedOrders.length} הזמנות נבחרו
                    </span>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="px-3 py-1.5 bg-[#10b981] text-white rounded-lg text-sm hover:bg-[#10b981]/90 transition-colors"
                        >
                            אשר כולם
                        </button>

                        <button
                            type="button"
                            className="px-3 py-1.5 bg-[#3b82f6] text-white rounded-lg text-sm hover:bg-[#3b82f6]/90 transition-colors"
                        >
                            שלח משלוח
                        </button>

                        <button
                            type="button"
                            className="px-3 py-1.5 bg-[#ef4444] text-white rounded-lg text-sm hover:bg-[#ef4444]/90 transition-colors"
                        >
                            בטל
                        </button>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="text-right p-3">
                                <input
                                    type="checkbox"
                                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                                    onChange={toggleSelectAll}
                                    className="rounded"
                                />
                            </th>
                            <th className="text-right text-xs text-muted-foreground p-3">מספר הזמנה</th>
                            <th className="text-right text-xs text-muted-foreground p-3">לקוח ופריטים</th>
                            <th className="text-right text-xs text-muted-foreground p-3">סכום</th>
                            <th className="text-right text-xs text-muted-foreground p-3">סטטוס</th>
                            <th className="text-right text-xs text-muted-foreground p-3">זמן</th>
                            <th className="text-right text-xs text-muted-foreground p-3">פעולות</th>
                        </tr>
                    </thead>

                    <tbody>
                        {filteredOrders.map((order) => {
                            const badge = getStatusBadge(order.status);

                            return (
                                <tr
                                    key={order.id}
                                    className="border-b border-border hover:bg-secondary/30 transition-colors"
                                >
                                    <td className="p-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedOrders.includes(order.id)}
                                            onChange={() => toggleSelect(order.id)}
                                            className="rounded"
                                        />
                                    </td>

                                    <td className="p-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-[#2563eb]">
                                                {order.number}
                                            </span>

                                            {order.priority && (
                                                <span className="text-xs bg-[#ef4444]/10 text-[#ef4444] px-2 py-0.5 rounded-full">
                                                    דחוף
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    <td className="p-3">
                                        <div>
                                            <p className="text-sm text-foreground">{order.customer}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {order.items} פריטים
                                            </p>
                                        </div>
                                    </td>

                                    <td className="p-3">
                                        <span className="text-sm text-foreground">
                                            {order.amount}
                                        </span>
                                    </td>

                                    <td className="p-3">
                                        <span className={`text-xs px-2 py-1 rounded-full border ${badge.color}`}>
                                            {badge.text}
                                        </span>
                                    </td>

                                    <td className="p-3">
                                        <span className="text-xs text-muted-foreground">
                                            {order.time}
                                        </span>
                                    </td>

                                    <td className="p-3">
                                        <div className="flex gap-1">
                                            {(order.status === 'pending' || order.status === 'pending_payment') && (
                                                <button
                                                    type="button"
                                                    className="p-1.5 rounded-lg hover:bg-[#10b981]/10 transition-colors group"
                                                    aria-label="אשר הזמנה"
                                                >
                                                    <CheckCircle2 className="w-4 h-4 text-muted-foreground group-hover:text-[#10b981]" />
                                                </button>
                                            )}

                                            {order.status === 'processing' && (
                                                <button
                                                    type="button"
                                                    className="p-1.5 rounded-lg hover:bg-[#3b82f6]/10 transition-colors group"
                                                    aria-label="שלח משלוח"
                                                >
                                                    <Truck className="w-4 h-4 text-muted-foreground group-hover:text-[#3b82f6]" />
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                                                aria-label="פעולות נוספות"
                                            >
                                                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <span className="text-sm text-muted-foreground">
                    מציג 8 מתוך 342 הזמנות
                </span>

                <div className="flex gap-1">
                    {[1, 2, 3, '...', 43].map((page, index) => (
                        <button
                            key={`${page}-${index}`}
                            type="button"
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${page === 1
                                    ? 'bg-[#2563eb] text-white'
                                    : 'text-foreground hover:bg-secondary'
                                }`}
                        >
                            {page}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}
