import numpy as np
from asymptotic_analysis import AsymptoticAnalyzer

def test_fit_complexity_power_law():
    analyzer = AsymptoticAnalyzer()
    # f(n) = 3 * n^2
    sizes = [10, 20, 30, 40, 50]
    times = [3 * (n ** 2) for n in sizes]

    fitted, params = analyzer.fit_complexity(sizes, times, model_type='power_law')

    # Check if a ~ 3 and b ~ 2
    assert np.isclose(params['a'], 3.0, rtol=1e-2)
    assert np.isclose(params['b'], 2.0, rtol=1e-2)

    # Check if the fitted function returns the expected value
    assert np.isclose(fitted(10), 300.0, rtol=1e-2)

def test_fit_complexity_n_log_n():
    analyzer = AsymptoticAnalyzer()
    # f(n) = 5 * n * log(n)
    sizes = [100, 200, 300, 400, 500]
    times = [5 * n * np.log(n) for n in sizes]

    fitted, params = analyzer.fit_complexity(sizes, times, model_type='n_log_n')

    # Check if a ~ 5
    assert np.isclose(params['a'], 5.0, rtol=1e-2)

    # Check if the fitted function returns the expected value
    assert np.isclose(fitted(100), 5 * 100 * np.log(100), rtol=1e-2)

def test_theosis_convergence_rate():
    analyzer = AsymptoticAnalyzer()
    # time_series = 1 - 0.5 * exp(-0.2 * t)
    time_series = [1 - 0.5 * np.exp(-0.2 * t) for t in range(10)]

    lam = analyzer.theosis_convergence_rate(time_series)

    # Check if lambda is ~ 0.2
    assert np.isclose(lam, 0.2, rtol=1e-2)

def test_asymptotic_equivalence():
    analyzer = AsymptoticAnalyzer()
    # f(n) = n^2 + n
    # g(n) = n^2
    def f(n): return n**2 + n
    def g(n): return n**2

    n_range = [100, 1000, 10000, 100000]
    limit = analyzer.asymptotic_equivalence(f, g, n_range)

    # Limit should be close to 1
    assert np.isclose(limit, 1.0, rtol=1e-2)
