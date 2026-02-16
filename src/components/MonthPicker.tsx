import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface MonthPickerProps {
    date: Date;
    onChange: (date: Date) => void;
}

export const MonthPicker = ({ date, onChange }: MonthPickerProps) => {

    const handlePrev = () => {
        const newDate = new Date(date);
        newDate.setMonth(date.getMonth() - 1);
        onChange(newDate);
    };

    const handleNext = () => {
        const newDate = new Date(date);
        newDate.setMonth(date.getMonth() + 1);

        // Optional: Block future dates? 
        // For now, let's allow it but data will be empty (or 0)
        onChange(newDate);
    };

    const formattedDate = date.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Check if current month is THIS month (to maybe disable next?)
    const now = new Date();
    const isCurrent = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    // Allow going up to current month only? Or future for budgeting?
    // Let's allow only up to current month for now as it is expense tracking.
    const canGoNext = date < new Date(now.getFullYear(), now.getMonth(), 1);

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={handlePrev} style={styles.arrowBtn} hitSlop={10}>
                <ChevronLeft size={24} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.dateContainer}>
                <Calendar size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.dateText}>{formattedDate}</Text>
            </View>

            <TouchableOpacity
                onPress={handleNext}
                style={[styles.arrowBtn, !canGoNext && styles.disabled]}
                disabled={!canGoNext}
                hitSlop={10}
            >
                <ChevronRight size={24} color={canGoNext ? colors.textSecondary : '#E0E0E0'} />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'white',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 20,
        marginVertical: 10,
        // Shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    dateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dateText: {
        ...typography.subHeader,
        fontSize: 16,
        color: colors.text,
        fontWeight: '700'
    },
    arrowBtn: {
        padding: 5,
    },
    disabled: {
        opacity: 0.5
    }
});
