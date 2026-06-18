import { createContext, useContext, useState } from 'react';

const UserContext = createContext(undefined);

export function UserProvider({ children }) {
    const [user, setUser] = useState({
        name: 'אדמין ראשי',
        email: 'admin@ecom.co.il',
        role: 'admin',
        avatar: 'A',
    });

    const setUserRole = (role) => {
        setUser((prev) => ({
            ...prev,
            role,
            name: role === 'admin' ? 'אדמין ראשי' : 'מנהל מלאי',
            email: role === 'admin' ? 'admin@ecom.co.il' : 'inventory@ecom.co.il',
            avatar: role === 'admin' ? 'A' : 'M',
        }));
    };

    return (
        <UserContext.Provider value={{ user, setUserRole }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const context = useContext(UserContext);

    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }

    return context;
}
