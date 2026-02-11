import { Platform } from 'react-native';

const family = Platform.select({
    ios: 'System',
    android: 'Roboto', // Default, but can be swapped for Inter if linked
});

export const typography = {
    display: {
        fontSize: 24,
        fontWeight: '700' as const,
        fontFamily: family,
        lineHeight: 32,
    },
    header: {
        fontSize: 20,
        fontWeight: '700' as const,
        fontFamily: family,
        lineHeight: 28,
    },
    subHeader: {
        fontSize: 16,
        fontWeight: '600' as const,
        fontFamily: family,
        lineHeight: 24,
    },
    body: {
        fontSize: 14,
        fontWeight: '400' as const,
        fontFamily: family,
        lineHeight: 20,
    },
    caption: {
        fontSize: 12,
        fontWeight: '400' as const,
        fontFamily: family,
        lineHeight: 16,
        color: '#6B7280',
    },
    mono: {
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
        fontSize: 12,
    }
};
