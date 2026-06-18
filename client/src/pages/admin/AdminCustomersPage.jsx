import { useState } from 'react';
import { Search, UserPlus, Mail, Phone, MapPin, Filter, Download } from 'lucide-react';

const customers = [
    { id: 1, name: 'יוסי כהן', email: 'yossi@example.com', phone: '054-1234567', location: 'תל אביב', orders: 24, totalSpent: '₪45,230', lastOrder: '15/03/2026', status: 'active', avatar: 'YK' },
    { id: 2, name: 'שרה לוי', email: 'sarah@example.com', phone: '052-9876543', location: 'ירושלים', orders: 18, totalSpent: '₪32,890', lastOrder: '14/03/2026', status: 'active', avatar: 'SL' },
    { id: 3, name: 'דוד מזרחי', email: 'david@example.com', phone: '053-5551234', location: 'חיפה', orders: 31, totalSpent: '₪67,120', lastOrder: '13/03/2026', status: 'active', avatar: 'DM' },
    { id: 4, name: 'רחל אברהם', email: 'rachel@example.com', phone: '050-7778899', location: 'באר שבע', orders: 12, totalSpent: '₪18,450', lastOrder: '10/03/2026', status: 'active', avatar: 'RA' },
    { id: 5, name: 'משה ישראלי', email: 'moshe@example.com', phone: '054-3334455', location: 'נתניה', orders: 8, totalSpent: '₪12,300', lastOrder: '05/02/2026', status: 'inactive', avatar: 'MY' },
    { id: 6, name: 'מירי שלום', email: 'miri@example.com', phone: '052-1112233', location: 'רעננה', orders: 27, totalSpent: '₪54,670', lastOrder: '14/03/2026', status: 'active', avatar: 'MS' },
];

const avatarColors = [
    'from-[#2563eb] to-[#7c3aed]',
    'from-[#7c3aed] to-[#ef4444]',
    'from-[#ef4444] to-[#fbbf24]',
    'from-[#fbbf24] to-[#10b981]',
    'from-[#10b981] to-[#2563eb]',
    'from-[#06b6d4] to-[#7c3aed]',
];

export default function AdminCustomersPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');

    const activeCustomers = customers.filter((customer) => customer.status === 'active');

    const filteredCustomers = customers.filter((customer) => {
        const search = searchTerm.trim().toLowerCase();

        const matchesSearch =
            customer.name.toLowerCase().includes(search) ||
            customer.email.toLowerCase().includes(search) ||
            customer.phone.includes(search) ||
            customer.location.includes(searchTerm.trim());

        const matchesStatus = statusFilter === 'all' || customer.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    return (
        <div className="p-8" dir="rtl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl text-foreground mb-2">לקוחות</h1>
                    <p className="text-muted-foreground">
                        ניהול ומעקב אחר הלקוחות שלך • {activeCustomers.length} לקוחות פעילים
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg hover:bg-secondary/70 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        ייצוא
                    </button>
                    <button
                        type="button"
                        className="flex items-center gap-2 bg-[#2563eb] text-[#0a0a0f] px-4 py-2 rounded-lg hover:bg-[#2563eb]/90 transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                        לקוח חדש
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div className="bg-card border border-border rounded-lg p-4 hover:border-[#2563eb]/30 transition-colors">
                    <p className="text-muted-foreground text-sm mb-1">סך הלקוחות</p>
                    <p className="text-2xl text-foreground mb-1">2,847</p>
                    <p className="text-xs text-[#10b981]">+12% מהחודש שעבר</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4 hover:border-[#2563eb]/30 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-muted-foreground text-sm">לקוחות פעילים</p>
                        <div className="w-2 h-2 bg-[#10b981] rounded-full animate-pulse" />
                    </div>
                    <p className="text-2xl text-[#2563eb] mb-1">2,341</p>
                    <p className="text-xs text-muted-foreground">82.2% מסך הלקוחות</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4 hover:border-[#2563eb]/30 transition-colors">
                    <p className="text-muted-foreground text-sm mb-1">ממוצע הזמנות</p>
                    <p className="text-2xl text-foreground mb-1">18.4</p>
                    <p className="text-xs text-muted-foreground">ללקוח פעיל</p>
                </div>

                <div className="bg-card border border-border rounded-lg p-4 hover:border-[#2563eb]/30 transition-colors">
                    <p className="text-muted-foreground text-sm mb-1">ערך לקוח ממוצע</p>
                    <p className="text-2xl text-foreground mb-1">₪34,120</p>
                    <p className="text-xs text-[#10b981]">+8% מהחודש שעבר</p>
                </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="חיפוש מהיר לקוח לפי שם, אימייל או טלפון..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-secondary border border-border rounded-lg pl-4 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowFilters((prev) => !prev)}
                        className="flex items-center justify-center gap-2 bg-secondary border border-border px-4 py-2.5 rounded-lg text-foreground hover:bg-secondary/70 transition-colors"
                    >
                        <Filter className="w-4 h-4" />
                        סינון
                    </button>
                </div>

                {showFilters && (
                    <div className="mt-4 pt-4 border-t border-border">
                        <label className="block text-sm text-muted-foreground mb-2">סטטוס לקוח</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full md:w-64 bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563eb]/50"
                        >
                            <option value="all">כל הלקוחות</option>
                            <option value="active">פעילים</option>
                            <option value="inactive">לא פעילים</option>
                        </select>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredCustomers.map((customer, index) => (
                    <div
                        key={customer.id}
                        className="bg-card border border-border rounded-lg p-6 hover:border-[#2563eb]/30 transition-all"
                    >
                        <div className="flex items-start gap-4">
                            <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${avatarColors[index % avatarColors.length]} flex items-center justify-center flex-shrink-0`}>
                                <span className="text-white font-medium">{customer.avatar}</span>
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between mb-3 gap-4">
                                    <div>
                                        <h3 className="text-foreground">{customer.name}</h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span
                                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs border ${customer.status === 'active'
                                                        ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20'
                                                        : 'bg-[#8b8b99]/10 text-[#8b8b99] border-[#8b8b99]/20'
                                                    }`}
                                            >
                                                {customer.status === 'active' ? 'פעיל' : 'לא פעיל'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="text-left">
                                        <p className="text-foreground">{customer.totalSpent}</p>
                                        <p className="text-xs text-muted-foreground">סה״כ הוצאות</p>
                                    </div>
                                </div>

                                <div className="space-y-2 mb-4">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Mail className="w-4 h-4" />
                                        <span>{customer.email}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Phone className="w-4 h-4" />
                                        <span>{customer.phone}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <MapPin className="w-4 h-4" />
                                        <span>{customer.location}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-border gap-4">
                                    <div>
                                        <p className="text-sm text-muted-foreground">הזמנות</p>
                                        <p className="text-foreground">{customer.orders}</p>
                                    </div>

                                    <div className="text-left">
                                        <p className="text-sm text-muted-foreground">הזמנה אחרונה</p>
                                        <p className="text-foreground">{customer.lastOrder}</p>
                                    </div>

                                    <button
                                        type="button"
                                        className="bg-secondary hover:bg-[#2563eb] hover:text-[#0a0a0f] px-4 py-2 rounded-lg text-sm transition-colors"
                                    >
                                        צפה בפרופיל
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filteredCustomers.length === 0 && (
                <div className="bg-card border border-border rounded-lg p-8 text-center mt-6">
                    <p className="text-foreground mb-1">לא נמצאו לקוחות</p>
                    <p className="text-sm text-muted-foreground">נסה לשנות את החיפוש או את הסינון</p>
                </div>
            )}
        </div>
    );
}
