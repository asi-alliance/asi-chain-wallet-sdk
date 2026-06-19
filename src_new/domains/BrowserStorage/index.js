const foo = (a, b) => {
    const foo1 = (...args) => {
        console.log(args);
    }

    foo1(a, b)
};

foo(34, 12);