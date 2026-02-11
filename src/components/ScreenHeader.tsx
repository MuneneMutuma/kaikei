import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Bell } from 'lucide-react-native';

interface ScreenHeaderProps {
    title: string;
    subtitle?: string;
    showNotification?: boolean;
    actionIcon?: React.ReactNode;
    onActionPress?: () => void;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
    title,
    subtitle,
    showNotification = true,
    actionIcon,
    onActionPress
}) => {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
            <View style={styles.topBar}>
                <View>
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                    <Text style={styles.title}>{title}</Text>
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
        paddingHorizontal: 20,
        paddingBottom: 10,
        backgroundColor: colors.background, // Ensure it blends with screen
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    subtitle: {
        ...typography.body,
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    title: {
        ...typography.header,
        fontSize: 24,
        color: colors.text,
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
