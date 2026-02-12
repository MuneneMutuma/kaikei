import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    interpolate,
    Extrapolation,
    withTiming
} from 'react-native-reanimated';
import { SmartSuggestionCard } from './SmartSuggestionCard';
import { PayeeCandidate } from '../services/intelligence/SmartOnboardingService';
import { colors } from '../theme/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

interface SuggestionDeckProps {
    suggestions: PayeeCandidate[];
    onConfirm: (suggestion: PayeeCandidate, categoryId: string) => void;
    onDismiss: (suggestion: PayeeCandidate) => void; // Permanent dismiss
    onOpenDetails: (suggestion: PayeeCandidate) => void;
    // We need to pass down category selection props too if we handle it inline
    categories: any[];
    onSelectCategory: (suggestion: PayeeCandidate) => void;
    selectedCategoryId?: string;
    isUpdating: boolean;
}

export const SuggestionDeck: React.FC<SuggestionDeckProps> = ({
    suggestions,
    onConfirm,
    onDismiss,
    onOpenDetails,
    categories,
    onSelectCategory,
    selectedCategoryId,
    isUpdating
}) => {
    // Local state to track the order of cards. 
    // We cycle this array locally to achieve "slide to back".
    const [deck, setDeck] = useState<PayeeCandidate[]>(suggestions);

    useEffect(() => {
        // Update deck if props change (e.g. one confirmed and removed)
        setDeck(suggestions);
    }, [suggestions]);

    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);

    const handleNext = () => {
        // Move top card to bottom
        setDeck(prev => {
            if (prev.length < 2) return prev;
            const [first, ...rest] = prev;
            return [...rest, first];
        });
        // Reset values
        translateX.value = 0;
        translateY.value = 0;
    };

    const pan = Gesture.Pan()
        .onChange((event) => {
            translateX.value = event.translationX;
            translateY.value = event.translationY * 0.2; // Slight vertical movement
        })
        .onEnd((event) => {
            if (Math.abs(event.translationX) > SWIPE_THRESHOLD) {
                // Swipe detected - Animate off screen then cycle
                const direction = Math.sign(event.translationX);
                translateX.value = withTiming(direction * SCREEN_WIDTH * 1.5, {}, () => {
                    runOnJS(handleNext)();
                });
            } else {
                // Spring back
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
            }
        });

    if (deck.length === 0) return null;

    const topCard = deck[0];
    const nextCard = deck.length > 1 ? deck[1] : null;

    return (
        <View style={styles.container}>
            {/* Background Card (Next) */}
            {nextCard && (
                <View style={[styles.cardWrapper, styles.nextCard]}>
                    <SmartSuggestionCard
                        payeeName={nextCard.name}
                        count={nextCard.count}
                        sampleTx={nextCard.sample}
                        onConfirm={() => { }}
                        onDismiss={() => { }}
                        onOpenDetails={() => { }}
                        onSelectCategory={() => { }}
                        isUpdating={false}
                    />
                </View>
            )}

            {/* Foreground Card (Top) - Animated */}
            <GestureDetector gesture={pan}>
                <AnimatedCard
                    translateX={translateX}
                    translateY={translateY}
                >
                    <SmartSuggestionCard
                        payeeName={topCard.name}
                        count={topCard.count}
                        sampleTx={topCard.sample}
                        onConfirm={() => onConfirm(topCard, selectedCategoryId || '')}
                        onDismiss={() => onDismiss(topCard)}
                        onOpenDetails={() => onOpenDetails(topCard)}
                        onSelectCategory={() => onSelectCategory(topCard)}
                        selectedCategoryName={categories.find(c => c.id === selectedCategoryId)?.name}
                        isUpdating={isUpdating}
                    />
                </AnimatedCard>
            </GestureDetector>
        </View>
    );
};

const AnimatedCard = ({ children, translateX, translateY }: any) => {
    const animatedStyle = useAnimatedStyle(() => {
        const rotate = interpolate(
            translateX.value,
            [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
            [-10, 0, 10],
            Extrapolation.CLAMP
        );

        return {
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { rotate: `${rotate}deg` }
            ]
        };
    });

    return (
        <Animated.View style={[styles.cardWrapper, animatedStyle]}>
            {children}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 140, // Height of the card area
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    cardWrapper: {
        position: 'absolute',
        width: '100%',
        zIndex: 2,
    },
    nextCard: {
        zIndex: 1,
        transform: [{ scale: 0.95 }, { translateY: 10 }],
        opacity: 0.6,
    }
});
