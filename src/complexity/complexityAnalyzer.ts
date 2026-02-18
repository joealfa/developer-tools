/**
 * Complexity Analyzer - Language-agnostic complexity calculator using regex-based heuristics
 */

import { ComplexityResult, SupportedLanguage, SUPPORTED_LANGUAGES } from './types';

interface FunctionInfo {
    name: string;
    lineNumber: number;
    bodyStart: number;
    bodyEnd: number;
    body: string;
}

export class ComplexityAnalyzer {
    /**
     * Analyze a document and return complexity results for all functions
     */
    analyze(text: string, languageId: string, filePath: string): ComplexityResult[] {
        if (!this.isSupported(languageId)) { return []; }

        const lines = text.split('\n');
        if (lines.length > 10000) { return []; }

        const language = languageId as SupportedLanguage;
        const functions = this.detectFunctions(lines, language);
        const results: ComplexityResult[] = [];

        for (const func of functions) {
            const cyclomatic = this.calculateCyclomaticComplexity(func.body, language);
            const cognitive = this.calculateCognitiveComplexity(func.body, language);

            results.push({
                filePath,
                functionName: func.name,
                lineNumber: func.lineNumber,
                endLineNumber: func.bodyEnd,
                cyclomaticComplexity: cyclomatic,
                cognitiveComplexity: cognitive,
                lineCount: func.bodyEnd - func.lineNumber + 1,
            });
        }

        return results;
    }

    isSupported(languageId: string): boolean {
        return (SUPPORTED_LANGUAGES as readonly string[]).includes(languageId);
    }

    private detectFunctions(lines: string[], language: SupportedLanguage): FunctionInfo[] {
        if (language === 'python') {
            return this.detectPythonFunctions(lines);
        }
        return this.detectBraceFunctions(lines, language);
    }

    private detectBraceFunctions(lines: string[], language: SupportedLanguage): FunctionInfo[] {
        const patterns = this.getFunctionPatterns(language);
        const functions: FunctionInfo[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of patterns) {
                const match = line.match(pattern);
                if (!match) { continue; }

                const name = this.extractFunctionName(match[0], language);
                if (!name) { continue; }

                const bodyRange = this.extractBraceBody(lines, i);
                if (!bodyRange) { continue; }

                const body = lines.slice(bodyRange.start, bodyRange.end + 1).join('\n');
                functions.push({
                    name,
                    lineNumber: i,
                    bodyStart: bodyRange.start,
                    bodyEnd: bodyRange.end,
                    body,
                });
                break;
            }
        }

        return functions;
    }

    private detectPythonFunctions(lines: string[]): FunctionInfo[] {
        const functions: FunctionInfo[] = [];
        const pattern = /^(\s*)def\s+(\w+)\s*\(/;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(pattern);
            if (!match) { continue; }

            const name = match[2];
            const indent = match[1].length;

            // Find end of function body by indentation
            let endLine = i;
            for (let j = i + 1; j < lines.length; j++) {
                const lineContent = lines[j];
                // Empty lines or lines with only whitespace don't end the function
                if (lineContent.trim() === '') { continue; }
                // Check if this line has greater indentation (still in function)
                const lineIndent = lineContent.match(/^(\s*)/)?.[1].length ?? 0;
                if (lineIndent > indent) {
                    endLine = j;
                } else {
                    break;
                }
            }

            if (endLine > i) {
                const body = lines.slice(i + 1, endLine + 1).join('\n');
                functions.push({ name, lineNumber: i, bodyStart: i + 1, bodyEnd: endLine, body });
            }
        }

        return functions;
    }

    private getFunctionPatterns(language: SupportedLanguage): RegExp[] {
        switch (language) {
            case 'typescript':
            case 'javascript':
            case 'typescriptreact':
            case 'javascriptreact':
                return [
                    /function\s+\w+\s*[(<]/,
                    /(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/,
                    /(?:async\s+)?(?:get|set)\s+\w+\s*\(/,
                    /^\s*(?:public|private|protected|static|async|\s)*\s*\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/,
                ];
            case 'go':
                return [/func\s+(?:\([^)]+\)\s*)?\w+\s*\(/];
            case 'java':
            case 'csharp':
                return [
                    /(?:public|private|protected|static|abstract|final|override|virtual|async|\s)+\s+\w+(?:<[^>]+>)?\s+\w+\s*\(/,
                ];
            case 'rust':
                return [/(?:pub\s+)?(?:async\s+)?fn\s+\w+/];
            default:
                return [];
        }
    }

    private extractFunctionName(matchStr: string, language: SupportedLanguage): string | null {
        let match: RegExpMatchArray | null;

        switch (language) {
            case 'typescript':
            case 'javascript':
            case 'typescriptreact':
            case 'javascriptreact':
                match = matchStr.match(/function\s+(\w+)/) ??
                        matchStr.match(/(?:const|let|var)\s+(\w+)/) ??
                        matchStr.match(/(?:get|set)\s+(\w+)/) ??
                        matchStr.match(/(\w+)\s*\(/);
                break;
            case 'python':
                match = matchStr.match(/def\s+(\w+)/);
                break;
            case 'go':
                match = matchStr.match(/func\s+(?:\([^)]+\)\s*)?(\w+)/);
                break;
            case 'java':
            case 'csharp':
                match = matchStr.match(/(\w+)\s*\(/);
                break;
            case 'rust':
                match = matchStr.match(/fn\s+(\w+)/);
                break;
            default:
                return null;
        }

        return match?.[1] ?? null;
    }

    private extractBraceBody(lines: string[], startLine: number): { start: number; end: number } | null {
        let braceCount = 0;
        let foundOpen = false;
        let bodyStart = startLine;

        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            for (const ch of line) {
                if (ch === '{') {
                    if (!foundOpen) {
                        foundOpen = true;
                        bodyStart = i;
                    }
                    braceCount++;
                } else if (ch === '}') {
                    braceCount--;
                    if (foundOpen && braceCount === 0) {
                        return { start: bodyStart, end: i };
                    }
                }
            }
        }

        return null;
    }

    private calculateCyclomaticComplexity(body: string, language: SupportedLanguage): number {
        let complexity = 1;

        // Control flow keywords
        const patterns = this.getCyclomaticPatterns(language);
        for (const pattern of patterns) {
            const matches = body.match(pattern);
            if (matches) { complexity += matches.length; }
        }

        // Logical operators
        const logicalOps = body.match(/&&|\|\|/g);
        if (logicalOps) { complexity += logicalOps.length; }

        // Ternary operator
        const ternary = body.match(/\?(?!=)/g);
        if (ternary) { complexity += ternary.length; }

        return complexity;
    }

    private getCyclomaticPatterns(language: SupportedLanguage): RegExp[] {
        switch (language) {
            case 'python':
                return [
                    /\bif\b/g,
                    /\belif\b/g,
                    /\belse\b/g,
                    /\bfor\b/g,
                    /\bwhile\b/g,
                    /\bexcept\b/g,
                    /\band\b/g,
                    /\bor\b/g,
                ];
            case 'go':
                return [
                    /\bif\b/g,
                    /\belse\b/g,
                    /\bfor\b/g,
                    /\bcase\b/g,
                    /\bselect\b/g,
                ];
            case 'rust':
                return [
                    /\bif\b/g,
                    /\belse\b/g,
                    /\bfor\b/g,
                    /\bwhile\b/g,
                    /\bloop\b/g,
                    /\bmatch\b/g,
                ];
            default: // JS/TS, Java, C#
                return [
                    /\bif\b/g,
                    /\belse\s+if\b/g,
                    /\belse\b/g,
                    /\bfor\b/g,
                    /\bwhile\b/g,
                    /\bdo\b/g,
                    /\bcase\b/g,
                    /\bcatch\b/g,
                ];
        }
    }

    calculateCognitiveComplexity(body: string, language: SupportedLanguage): number {
        const lines = body.split('\n');
        let complexity = 0;
        let nestingLevel = 0;
        const nestingStack: string[] = [];

        const isNestingKeyword = (kw: string) =>
            ['if', 'for', 'while', 'do', 'switch', 'try', 'match', 'select', 'loop', 'with'].includes(kw);

        const isIncrement = (kw: string) =>
            ['if', 'elif', 'else if', 'for', 'while', 'do', 'case', 'catch', 'except', 'else', 'match', 'select', 'loop'].includes(kw);

        const noNestingPenalty = (kw: string) =>
            ['else', 'elif', 'else if'].includes(kw);

        for (const line of lines) {
            const trimmed = line.trim();

            // Track nesting by braces (for C-like languages)
            if (language !== 'python') {
                for (const ch of trimmed) {
                    if (ch === '{') {
                        nestingStack.push('{');
                    } else if (ch === '}') {
                        nestingStack.pop();
                    }
                }
            }

            // Extract keywords from the line
            const keywords = this.extractControlFlowKeywords(trimmed, language);

            for (const kw of keywords) {
                if (isIncrement(kw)) {
                    if (noNestingPenalty(kw)) {
                        complexity += 1;
                    } else {
                        complexity += 1 + nestingLevel;
                    }
                }

                if (isNestingKeyword(kw)) {
                    nestingLevel++;
                }
            }

            // Decrease nesting for closing constructs
            if (language === 'python') {
                // Python uses indentation, handled differently
            } else {
                // Rough heuristic: closing brace decreases nesting
                if (trimmed === '}') {
                    nestingLevel = Math.max(0, nestingLevel - 1);
                }
            }

            // Logical operators add 1 each (no nesting penalty)
            const logicalOps = trimmed.match(/&&|\|\|/g);
            if (logicalOps) {
                complexity += logicalOps.length;
            }
        }

        return complexity;
    }

    private extractControlFlowKeywords(line: string, _language: SupportedLanguage): string[] {
        const keywords: string[] = [];

        if (/\belse\s+if\b/.test(line)) { keywords.push('else if'); }
        else if (/\belif\b/.test(line)) { keywords.push('elif'); }
        else {
            if (/\bif\b/.test(line)) { keywords.push('if'); }
            if (/\belse\b/.test(line)) { keywords.push('else'); }
        }

        if (/\bfor\b/.test(line)) { keywords.push('for'); }
        if (/\bwhile\b/.test(line)) { keywords.push('while'); }
        if (/\bdo\b/.test(line)) { keywords.push('do'); }
        if (/\bswitch\b/.test(line)) { keywords.push('switch'); }
        if (/\bcase\b/.test(line)) { keywords.push('case'); }
        if (/\bcatch\b/.test(line)) { keywords.push('catch'); }
        if (/\bexcept\b/.test(line)) { keywords.push('except'); }
        if (/\btry\b/.test(line)) { keywords.push('try'); }
        if (/\bmatch\b/.test(line)) { keywords.push('match'); }
        if (/\bloop\b/.test(line)) { keywords.push('loop'); }
        if (/\bselect\b/.test(line)) { keywords.push('select'); }

        return keywords;
    }
}
