import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react-native';
import { colors } from '../theme/colors';

interface MonthPickerProps {
    currentMonth: string; // "YYYY-MM"
    onMonthChange: (newMonth: string) => void;
    maxMonth?: string; // Optional: "YYYY-MM" to restrict future nav
}

export const MonthPicker: React.FC<MonthPickerProps> = ({ currentMonth, onMonthChange, maxMonth }) => {

    const changeMonth = (delta: number) => {
        const [year, month] = currentMonth.split('-').map(Number);
        const date = new Date(year, month - 1 + delta, 1);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        onMonthChange(`${y}-${m}`);
    };

    const formatMonthReadable = (isoMonth: string) => {
        const [y, m] = isoMonth.split('-').map(Number);
        const date = new Date(y, m - 1, 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const canGoNext = !maxMonth || currentMonth < maxMonth;

    return (
        <View style={styles.container}>
            <View style={styles.navRow}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtn} hitSlop={10}>
                    <ChevronLeft size={22} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.dateDisplay}>
                    <Calendar size={16} color={colors.primary} style={{ marginRight: 8 }} />
                    <Text style={styles.monthText}>{formatMonthReadable(currentMonth)}</Text>
                </View>

                <TouchableOpacity
                    onPress={() => changeMonth(1)}
                    style={[styles.navBtn, !canGoNext && styles.disabled]}
                    disabled={!canGoNext}
                    hitSlop={10}
                >
                    <ChevronRight size={22} color={canGoNext ? colors.text : colors.textSecondary} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        marginVertical: 12,
    },
    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 6,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        // Subtle Shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    dateDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    monthText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
    navBtn: {
        padding: 8,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
    },
    disabled: {
        opacity: 0.2
    }
});
