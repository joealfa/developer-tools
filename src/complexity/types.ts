/**
 * Inline Code Complexity Hints type definitions
 */

export interface ComplexityResult {
    filePath: string;
    functionName: string;
    lineNumber: number;
    endLineNumber: number;
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    lineCount: number;
}

export type ComplexityLevel = 'low' | 'moderate' | 'high' | 'very-high';

export interface ComplexityThresholds {
    moderate: number;
    high: number;
    veryHigh: number;
}

export const DEFAULT_THRESHOLDS: ComplexityThresholds = {
    moderate: 6,
    high: 11,
    veryHigh: 21,
};

export const SUPPORTED_LANGUAGES = [
    'typescript',
    'javascript',
    'typescriptreact',
    'javascriptreact',
    'python',
    'go',
    'java',
    'csharp',
    'rust',
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
