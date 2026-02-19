import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Bell, ArrowLeft } from 'lucide-react-native';

interface ScreenHeaderProps {
    title: string;
    subtitle?: string;
    showNotification?: boolean;
    showBackButton?: boolean;
    actionIcon?: React.ReactNode;
    onActionPress?: () => void;
    compact?: boolean;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
    title,
    subtitle,
    showNotification = true,
    showBackButton = false,
    actionIcon,
    onActionPress,
    compact = true
}) => {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();

    return (
        <View style={[styles.container, { paddingTop: insets.top + (compact ? 4 : 10), paddingBottom: compact ? 0 : 10 }]}>
            <View style={[styles.topBar, compact && { marginBottom: 4, marginTop: 4 }]}>
                <View style={styles.leftContainer}>
                    {showBackButton && (
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                            <ArrowLeft size={24} color={colors.text} />
                        </TouchableOpacity>
                    )}
                    <View>
                        {subtitle && <Text style={[styles.subtitle, compact && { marginBottom: 0 }]}>{subtitle}</Text>}
                        <Text style={[styles.title, compact && { fontSize: 24, lineHeight: 28 }]}>{title}</Text>
                    </View>
                </View>

                {(showNotification || actionIcon) && (
                    <TouchableOpacity style={styles.iconBtn} onPress={onActionPress}>
                        {actionIcon ? actionIcon : (
                            <>
                                <Bell size={24} color={colors.text} />
                                <View style={styles.notificationDot} />
                            </>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 24, // Matched Home
        paddingBottom: 10,
        backgroundColor: colors.background,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        marginTop: 10, // Added to push down slightly more (total ~20+10+insets)
    },
    leftContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    backBtn: {
        marginRight: 8,
        padding: 4,
    },
    subtitle: {
        ...typography.body,
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 2, // Tighter spacing
        fontWeight: '500', // Matches "Habari," weight roughly? Home uses styles.greeting
    },
    title: {
        ...typography.header,
        fontSize: 28, // Increased from 24 to match Home's visual weight (Home name is likely large)
        color: colors.text,
        lineHeight: 34,
    },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: 'black',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    notificationDot: {
        position: 'absolute',
        top: 10,
        right: 12,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.error,
        borderWidth: 1,
        borderColor: colors.surface,
    }
});
