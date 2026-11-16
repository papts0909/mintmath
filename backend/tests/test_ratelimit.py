from app.services.ratelimit import RateLimiter


def test_window() -> None:
    rl = RateLimiter(2, 60)
    assert rl.allow("a", 0)
    assert rl.allow("a", 1)
    assert not rl.allow("a", 2)
    assert rl.allow("b", 2)
    assert rl.allow("a", 61)


def test_disabled() -> None:
    rl = RateLimiter(0)
    assert all(rl.allow("a") for _ in range(100))
