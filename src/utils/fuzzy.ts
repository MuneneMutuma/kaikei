/**
 * Calculates the Levenshtein distance between two strings.
 * Lower distance means higher similarity.
 */
export const levenshteinDistance = (a: string, b: string): number => {
    const matrix = [];

    // Increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // Increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1 // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
};

/**
 * Finds the best match from a list of options.
 * @param query The string to match
 * @param options The list of candidate strings
 * @param threshold Max distance to consider a match (default 3)
 */
export const findBestMatch = (query: string, options: string[], threshold = 3): { match: string; score: number } | null => {
    let bestMatch: string | null = null;
    let bestScore = Infinity;

    const lowerQuery = query.toLowerCase().trim();

    for (const option of options) {
        const lowerOption = option.toLowerCase();
        // Exact substring check first (Fastest)
        if (lowerOption.includes(lowerQuery) || lowerQuery.includes(lowerOption)) {
            // Bonus for containment, but we want the 'closest' containment
            const lenDiff = Math.abs(lowerOption.length - lowerQuery.length);
            if (lenDiff < bestScore) {
                bestScore = lenDiff * 0.5; // Weight containment higher than edit distance
                bestMatch = option;
            }
            continue;
        }

        const score = levenshteinDistance(lowerQuery, lowerOption);
        if (score < bestScore && score <= threshold) {
            bestScore = score;
            bestMatch = option;
        }
    }

    if (bestMatch && bestScore <= threshold) {
        return { match: bestMatch, score: bestScore };
    }
    return null;
};
