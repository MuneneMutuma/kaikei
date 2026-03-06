import React, { useRef, useState, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react';
import {
    StyleSheet,
    View,
    Text,
    Animated,
    PanResponder,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    Modal,
    TouchableWithoutFeedback,
    Keyboard,
    KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 0.5;

export interface SwipeableSheetRef {
    present: () => void;
    dismiss: () => void;
}

interface SwipeableSheetProps {
    children: React.ReactNode;
    snapPoints?: (string | number)[];
    title?: string;
    onDismiss?: () => void;
}

export const SwipeableSheet = forwardRef<SwipeableSheetRef, SwipeableSheetProps>(({
    children,
    snapPoints = ['94%'],
    title,
    onDismiss,
}, ref) => {
    const [visible, setVisible] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const insets = useSafeAreaInsets();
    const onDismissRef = useRef(onDismiss);
    onDismissRef.current = onDismiss;

    const snapPoint = snapPoints[0];
    const initialMaxHeight = typeof snapPoint === 'string' && snapPoint.endsWith('%')
        ? (parseFloat(snapPoint) / 100) * SCREEN_HEIGHT
        : (typeof snapPoint === 'number' ? snapPoint : SCREEN_HEIGHT * 0.94);

    // Dynamic maxHeight that shrinks when keyboard is up to prevent status bar overflow
    const maxSheetHeight = visible 
        ? Math.min(initialMaxHeight, SCREEN_HEIGHT - keyboardHeight - (Platform.OS === 'ios' ? 40 : 20))
        : initialMaxHeight;

    const panY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    const backdropOpacity = panY.interpolate({
        inputRange: [0, maxSheetHeight],
        outputRange: [0.5, 0],
        extrapolate: 'clamp',
    });

    useEffect(() => {
        const showSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e: KeyboardEvent) => setKeyboardHeight(e.endCoordinates.height)
        );
        const hideSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => setKeyboardHeight(0)
        );

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    const doClose = useCallback(() => {
        Animated.timing(panY, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setVisible(false);
            if (onDismissRef.current) onDismissRef.current();
        });
    }, [panY]);

    useImperativeHandle(ref, () => ({
        present: () => {
            panY.setValue(SCREEN_HEIGHT);
            setVisible(true);
        },
        dismiss: () => doClose(),
    }), [doClose, panY]);

    useEffect(() => {
        if (visible) {
            Animated.spring(panY, {
                toValue: 0,
                useNativeDriver: true,
                bounciness: 4,
                speed: 14,
            }).start();
        }
    }, [visible, panY]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > Math.abs(gs.dx),
            onPanResponderMove: (_, gs) => {
                if (gs.dy > 0) panY.setValue(gs.dy);
            },
            onPanResponderRelease: (_, gs) => {
                if (gs.dy > DISMISS_THRESHOLD || gs.vy > VELOCITY_THRESHOLD) {
                    doClose();
                } else {
                    Animated.spring(panY, {
                        toValue: 0,
                        useNativeDriver: true,
                        bounciness: 0,
                    }).start();
                }
            },
        })
    ).current;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={doClose}
        >
            <TouchableWithoutFeedback onPress={doClose}>
                <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
            </TouchableWithoutFeedback>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.keyboardView}
                pointerEvents="box-none"
            >
                <Animated.View
                    style={[
                        styles.sheetContainer,
                        {
                            maxHeight: maxSheetHeight,
                            paddingBottom: keyboardHeight > 0 ? 10 : Math.max(insets.bottom, 16),
                            transform: [{ translateY: panY }],
                        },
                    ]}
                >
                    <View {...panResponder.panHandlers} style={styles.dragZone}>
                        <View style={styles.handle} />
                        {title && (
                            <View style={styles.header}>
                                <Text style={styles.title}>{title}</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.contentWrapper}>
                        {children}
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
});

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
    },
    keyboardView: { flex: 1, justifyContent: 'flex-end' },
    sheetContainer: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    dragZone: {
        alignItems: 'center',
        paddingTop: 12,
        backgroundColor: colors.surface,
        paddingBottom: 8,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    handle: {
        backgroundColor: '#E2E8F0',
        width: 40,
        height: 5,
        borderRadius: 3,
        marginBottom: 12,
    },
    header: {
        paddingHorizontal: 20,
        alignItems: 'center',
        width: '100%',
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    title: { fontSize: 18, fontWeight: '700', color: colors.text },
    contentWrapper: {
        width: '100%',
    },
});
