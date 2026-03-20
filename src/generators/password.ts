import { randomBytes } from 'crypto';

/**
 * Password generation options
 */
export interface PasswordOptions {
	length: number;
	includeUppercase: boolean;
	includeLowercase: boolean;
	includeNumbers: boolean;
	includeSpecial: boolean;
	minNumbers: number;
	minSpecial: number;
	avoidAmbiguous: boolean;
}

/**
 * Default password options
 */
export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
	length: 14,
	includeUppercase: true,
	includeLowercase: true,
	includeNumbers: true,
	includeSpecial: true,
	minNumbers: 2,
	minSpecial: 2,
	avoidAmbiguous: false,
};

// Character sets
const CHARSETS = {
	uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	uppercaseNoAmbiguous: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // No I, O
	lowercase: 'abcdefghijklmnopqrstuvwxyz',
	lowercaseNoAmbiguous: 'abcdefghjkmnpqrstuvwxyz', // No i, l, o
	numbers: '0123456789',
	numbersNoAmbiguous: '23456789', // No 0, 1
	special: '!@#$%^&*',
};

/**
 * Select a random character from a charset using cryptographic RNG.
 * Uses rejection sampling to avoid modulo bias.
 */
function secureRandomChar(charset: string): string {
	const maxValid = 256 - (256 % charset.length);
	let byte: number;
	do {
		byte = randomBytes(1)[0];
	} while (byte >= maxValid);
	return charset[byte % charset.length];
}

/**
 * Generate a cryptographically random integer in [0, max) using rejection sampling.
 */
function secureRandomInt(max: number): number {
	const maxValid = 256 - (256 % max);
	let byte: number;
	do {
		byte = randomBytes(1)[0];
	} while (byte >= maxValid);
	return byte % max;
}

/**
 * Generate a password based on options
 */
export function generatePassword(options: PasswordOptions): string {
	let chars = '';
	const requiredChars: string[] = [];
	const length = Math.max(0, Math.floor(options.length));
	if (length === 0) {
		return '';
	}

	let minNumbers = options.includeNumbers ? Math.max(0, Math.floor(options.minNumbers)) : 0;
	let minSpecial = options.includeSpecial ? Math.max(0, Math.floor(options.minSpecial)) : 0;

	if (options.includeUppercase) {
		const set = options.avoidAmbiguous ? CHARSETS.uppercaseNoAmbiguous : CHARSETS.uppercase;
		chars += set;
	}

	if (options.includeLowercase) {
		const set = options.avoidAmbiguous ? CHARSETS.lowercaseNoAmbiguous : CHARSETS.lowercase;
		chars += set;
	}

	if (options.includeNumbers) {
		const set = options.avoidAmbiguous ? CHARSETS.numbersNoAmbiguous : CHARSETS.numbers;
		chars += set;
		// Add minimum required numbers using secure RNG
		for (let i = 0; i < minNumbers; i++) {
			requiredChars.push(secureRandomChar(set));
		}
	}

	if (options.includeSpecial) {
		chars += CHARSETS.special;
		// Add minimum required special characters using secure RNG
		for (let i = 0; i < minSpecial; i++) {
			requiredChars.push(secureRandomChar(CHARSETS.special));
		}
	}

	if (chars.length === 0) {
		return '';
	}

	// If requested minima exceed total length, reduce them deterministically
	// while preserving as many required characters as possible.
	let overflow = requiredChars.length - length;
	while (overflow > 0 && (minNumbers > 0 || minSpecial > 0)) {
		if (minNumbers >= minSpecial && minNumbers > 0) {
			minNumbers--;
		} else if (minSpecial > 0) {
			minSpecial--;
		}
		overflow--;
	}

	if (overflow > 0) {
		return '';
	}

	// Rebuild required chars after normalization
	requiredChars.length = 0;
	if (options.includeNumbers) {
		const set = options.avoidAmbiguous ? CHARSETS.numbersNoAmbiguous : CHARSETS.numbers;
		for (let i = 0; i < minNumbers; i++) {
			requiredChars.push(secureRandomChar(set));
		}
	}
	if (options.includeSpecial) {
		for (let i = 0; i < minSpecial; i++) {
			requiredChars.push(secureRandomChar(CHARSETS.special));
		}
	}

	// Build password with required characters first, then fill the remainder.
	const password: string[] = [...requiredChars];
	for (let i = password.length; i < length; i++) {
		password.push(secureRandomChar(chars));
	}

	// Secure Fisher-Yates shuffle
	for (let i = password.length - 1; i > 0; i--) {
		const j = secureRandomInt(i + 1);
		const tmp = password[i];
		password[i] = password[j];
		password[j] = tmp;
	}

	return password.join('');
}
