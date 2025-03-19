/**
 * Core functional programming utilities
 */

// Function composition (right to left)
export const compose = (...fns) =>
	fns.reduceRight(
		(f, g) =>
			(...args) =>
				f(g(...args))
	);

// Function composition (left to right)
export const pipe = (...fns) =>
	fns.reduce(
		(f, g) =>
			(...args) =>
				g(f(...args))
	);

// Curry function implementation
export const curry = (fn) => {
	const arity = fn.length;
	return function curried(...args) {
		if (args.length >= arity) {
			return fn(...args);
		}
		return (...moreArgs) => curried(...args, ...moreArgs);
	};
};

// Partial application
export const partial =
	(fn, ...args) =>
	(...moreArgs) =>
		fn(...args, ...moreArgs);

// Map implementation for various data types
export const map = curry((fn, functor) => functor.map(fn));

// Chain/flatMap implementation
export const chain = curry((fn, monad) => monad.chain(fn));

// Tap for side effects in pipelines
export const tap = curry((fn, x) => {
	fn(x);
	return x;
});

// Safe property access
export const prop = curry((key, obj) => obj?.[key]);

/**
 * Creates a function that memoizes the result of a function
 * @param {Function} fn - Function to memoize
 * @returns {Function} Memoized function
 */
export const memoize = (fn) => {
	const cache = new Map();
	return (...args) => {
		const key = JSON.stringify(args);
		if (!cache.has(key)) {
			cache.set(key, fn(...args));
		}
		return cache.get(key);
	};
};

/**
 * Creates a function that debounces another function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export const debounce = (fn, delay) => {
	let timeoutId;
	return (...args) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delay);
	};
};
