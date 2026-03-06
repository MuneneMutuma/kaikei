import {
    ShoppingBasket,
    Fuel,
    Utensils,
    Bus,
    Zap,
    Smartphone,
    MoreHorizontal,
    ShoppingBag,
    Home,
    HeartPulse,
    Wrench,
    Coins
} from 'lucide-react-native';

export const getCategoryIcon = (name?: string | null) => {
    const n = (name || 'Other').toLowerCase();
    if (n.includes('stock') || n.includes('bag')) return ShoppingBag;
    if (n.includes('fuel')) return Fuel;
    if (n.includes('food') || n.includes('meal')) return Utensils;
    if (n.includes('transport') || n.includes('mate') || n.includes('fare')) return Bus;
    if (n.includes('rent') || n.includes('home')) return Home;
    if (n.includes('airtime') || n.includes('data')) return Smartphone;
    if (n.includes('repair') || n.includes('service')) return Wrench;
    if (n.includes('health') || n.includes('hospital')) return HeartPulse;
    if (n.includes('util') || n.includes('kplc') || n.includes('water')) return Zap;
    if (n.includes('shop')) return ShoppingBasket;
    if (n.includes('float') || n.includes('mpesa')) return Coins;
    return MoreHorizontal;
};

export const getCategoryColor = (name?: string | null) => {
    const n = (name || 'Other').toLowerCase();
    if (n.includes('stock')) return "#4CAF50";
    if (n.includes('fuel')) return "#FF9800";
    if (n.includes('food') || n.includes('meal')) return "#E91E63";
    if (n.includes('transport')) return "#2196F3";
    if (n.includes('rent')) return "#9C27B0";
    if (n.includes('airtime')) return "#009688";
    if (n.includes('repair')) return "#795548";
    if (n.includes('health')) return "#F44336";
    if (n.includes('util')) return "#607D8B";
    if (n.includes('shop')) return "#FF5722";
    if (n.includes('float')) return "#3F51B5";
    return "#94A3B8"; // Default color
};

export const formatTagName = (name?: string | null): string => {
    if (!name) return "";
    return name.split(' ').map(sub => sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase()).join(' ');
};
