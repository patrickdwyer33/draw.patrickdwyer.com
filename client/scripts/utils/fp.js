/**
 * core functional programming utilities
 */

export const compose = (...fns) =>
	fns.reduceRight(
		(f, g) =>
			(...args) =>
				f(g(...args))
	);

export const pipe = (...fns) =>
	fns.reduce(
		(f, g) =>
			(...args) =>
				g(f(...args))
	);

export const curry = (fn) => {
	const arity = fn.length;
	return function curried(...args) {
		if (args.length >= arity) {
			return fn(...args);
		}
		return (...moreArgs) => curried(...args, ...moreArgs);
	};
};

export const partial =
	(fn, ...args) =>
	(...moreArgs) =>
		fn(...args, ...moreArgs);

export const map = curry((fn, functor) => functor.map(fn));

export const chain = curry((fn, monad) => monad.chain(fn));

export const tap = curry((fn, x) => {
	fn(x);
	return x;
});

export const prop = curry((key, obj) => obj?.[key]);

/**
 * creates a function that memoizes the result of a function
 * @param {Function} fn - function to memoize
 * @returns {Function} memoized function
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
 * creates a function that debounces another function
 * @param {Function} fn - function to debounce
 * @param {number} delay - delay in milliseconds
 * @returns {Function} debounced function
 */
export const debounce = (fn, delay) => {
	let timeoutId;
	return (...args) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delay);
	};
};
