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
	minNumbers: 1,
	minSpecial: 1,
	avoidAmbiguous: false
};

// Character sets
const CHARSETS = {
	uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	uppercaseNoAmbiguous: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // No I, O
	lowercase: 'abcdefghijklmnopqrstuvwxyz',
	lowercaseNoAmbiguous: 'abcdefghjkmnpqrstuvwxyz', // No i, l, o
	numbers: '0123456789',
	numbersNoAmbiguous: '23456789', // No 0, 1
	special: '!@#$%^&*'
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
		for (let i = 0; i < options.minNumbers; i++) {
			requiredChars.push(secureRandomChar(set));
		}
	}

	if (options.includeSpecial) {
		chars += CHARSETS.special;
		// Add minimum required special characters using secure RNG
		for (let i = 0; i < options.minSpecial; i++) {
			requiredChars.push(secureRandomChar(CHARSETS.special));
		}
	}

	if (chars.length === 0) {
		return '';
	}

	// Fill password with cryptographically random characters (no modulo bias)
	const password: string[] = [];
	for (let i = 0; i < options.length; i++) {
		password.push(secureRandomChar(chars));
	}

	// Insert required characters at cryptographically random positions
	for (const reqChar of requiredChars) {
		const pos = secureRandomInt(options.length);
		password[pos] = reqChar;
	}

	return password.join('');
}
