import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { View as MotiView } from 'moti';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Wallet, TrendingUp, TrendingDown, Bell } from 'lucide-react-native';

interface HomeHeaderProps {
    userName: string;
    totalSpent: number;
    totalIncome: number;
}

const HomeHeader: React.FC<HomeHeaderProps> = ({ userName, totalSpent, totalIncome }) => {
    const [greeting, setGreeting] = useState('');

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good Morning');
        else if (hour < 18) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');
    }, []);

    const net = totalIncome - totalSpent;
    const isPositive = net >= 0;

    return (
        <View style={styles.container}>
            {/* Header / Top Bar */}
            <View style={styles.topBar}>
                <View>
                    <Text style={styles.greetingSub}>{greeting},</Text>
                    <Text style={styles.greetingName}>{userName}</Text>
                </View>
                <TouchableOpacity style={styles.iconBtn}>
                    <Bell size={24} color={colors.text} />
                    <View style={styles.notificationDot} />
                </TouchableOpacity>
            </View>

            {/* The Super Widget */}
            <MotiView
                from={{ opacity: 0, scale: 0.95, translateY: 10 }}
                animate={{ opacity: 1, scale: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 600 }}
            >
                <LinearGradient
                    colors={['#00695C', '#2E7D32']} // Deep Teal to Safaricom Green
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.card}
                >
                    {/* Decorative Background Circles */}
                    <View style={[styles.circle, { top: -20, right: -20, width: 100, height: 100 }]} />
                    <View style={[styles.circle, { bottom: -40, left: -20, width: 150, height: 150, opacity: 0.05 }]} />

                    {/* Main Content */}
                    <View style={styles.cardContent}>
                        <View>
                            <Text style={styles.cardLabel}>Total Spent Today</Text>
                            <Text style={styles.cardAmount}>
                                <Text style={styles.currency}>Ksh</Text> {totalSpent.toLocaleString()}
                            </Text>
                        </View>

                        {/* Status Icon */}
                        <View style={styles.statusIcon}>
                            <Wallet size={24} color="white" opacity={0.8} />
                        </View>
                    </View>

                    {/* Footer / Stats Row */}
                    <View style={styles.cardFooter}>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Net Balance</Text>
                            <View style={[styles.trendPill, { backgroundColor: isPositive ? 'rgba(255,255,255,0.2)' : 'rgba(255,82,82,0.2)' }]}>
                                {isPositive ? <TrendingUp size={14} color="white" /> : <TrendingDown size={14} color="#FFCDD2" />}
                                <Text style={[styles.statValue, { color: isPositive ? 'white' : '#FFCDD2' }]}>
                                    Ksh {Math.abs(net).toLocaleString()}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Daily Limit</Text>
                            <Text style={styles.statValueSimple}>85% Left</Text>
                        </View>
                    </View>
                </LinearGradient>
            </MotiView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
        backgroundColor: colors.background,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    greetingSub: {
        ...typography.body,
        fontSize: 14,
        color: colors.textSecondary,
    },
    greetingName: {
        ...typography.header,
        fontSize: 24,
        color: colors.text,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    notificationDot: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.danger,
        borderWidth: 1,
        borderColor: colors.surface
    },

    // Card
    card: {
        borderRadius: 24,
        padding: 24,
        shadowColor: "#004D40",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
        overflow: 'hidden', // Clip circles
        minHeight: 180,
        justifyContent: 'space-between'
    },
    circle: {
        position: 'absolute',
        borderRadius: 999,
        backgroundColor: 'white',
        opacity: 0.1,
    },
    cardContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    cardLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontFamily: typography.body.fontFamily,
    },
    currency: {
        fontSize: 20,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.6)'
    },
    cardAmount: {
        color: 'white',
        fontSize: 36,
        fontWeight: '800',
        fontFamily: typography.mono.fontFamily,
        letterSpacing: -1,
    },
    statusIcon: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
    },

    // Footer
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.15)',
    },
    statItem: {
        flex: 1,
    },
    statLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        marginBottom: 4,
    },
    trendPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4
    },
    statValue: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
        fontFamily: typography.mono.fontFamily,
    },
    statValueSimple: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },
    divider: {
        width: 1,
        height: 30,
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginHorizontal: 16,
    }
});

export default HomeHeader;
