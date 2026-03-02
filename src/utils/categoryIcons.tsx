import {
    ShoppingBasket,
    Fuel,
    Utensils,
    Bus,
    Zap,
    Smartphone,
    MoreHorizontal,
    Wallet,
    Home,
    HeartPulse,
    Tent,
    Smartphone as Phone,
    Package,
    ShieldCheck,
    Briefcase
} from 'lucide-react-native';
import { colors } from '../theme/colors';

export const getCategoryIcon = (name?: string | null) => {
    const n = (name || 'Other').toLowerCase();

    if (n.includes('food') || n.includes('dining')) return Utensils;
    if (n.includes('grocer') || n.includes('stock') || n.includes('shopping')) return ShoppingBasket;
    if (n.includes('fuel') || n.includes('car') || n.includes('transport')) return Bus;
    if (n.includes('travel') || n.includes('trip') || n.includes('fuel')) return Fuel;
    if (n.includes('utilit') || n.includes('bill') || n.includes('power')) return Zap;
    if (n.includes('airtime') || n.includes('phone') || n.includes('data')) return Phone;
    if (n.includes('rent') || n.includes('home')) return Home;
    if (n.includes('health') || n.includes('med')) return HeartPulse;
    if (n.includes('fun') || n.includes('leisure')) return Tent;
    if (n.includes('business') || n.includes('work')) return Briefcase;
    if (n.includes('insurance') || n.includes('safe')) return ShieldCheck;
    if (n.includes('saving')) return Wallet;

    return MoreHorizontal;
};

export const getCategoryColor = (name?: string | null) => {
    const n = (name || 'Other').toLowerCase();

    if (n.includes('food')) return '#F59E0B'; // Amber
    if (n.includes('grocer') || n.includes('shopping')) return '#10B981'; // Emerald
    if (n.includes('fuel') || n.includes('transport')) return '#3B82F6'; // Blue
    if (n.includes('utilit')) return '#FACC15'; // Yellow
    if (n.includes('health')) return '#EF4444'; // Red
    if (n.includes('business')) return '#6366F1'; // Indigo
    if (n.includes('home') || n.includes('rent')) return '#8B5CF6'; // Violet
    if (n.includes('fun')) return '#EC4899'; // Pink

    return '#64748B'; // Gray (Slate)
};
