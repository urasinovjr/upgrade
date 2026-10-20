from datetime import UTC, datetime, timedelta

from app.billing.rules import Period, extension_start, subscription_state, trial_period

NOW = datetime(2026, 10, 21, 12, tzinfo=UTC)
DAY = timedelta(days=1)


def test_without_periods_there_is_no_subscription():
    state = subscription_state([], NOW)

    assert state.status == "none"
    assert not state.active


def test_trial_is_active_until_its_end():
    trial = trial_period(NOW - DAY, 14)

    assert subscription_state([trial], NOW).status == "trial"
    assert subscription_state([trial], trial.ends_at).status == "expired"


def test_granted_period_wins_over_trial_and_shows_last_end():
    trial = trial_period(NOW - DAY, 14)
    granted = Period("granted", NOW - DAY, NOW + 40 * DAY)

    state = subscription_state([trial, granted], NOW)

    assert (state.status, state.kind, state.ends_at) == ("active", "granted", NOW + 40 * DAY)


def test_future_period_does_not_open_access_yet():
    upcoming = Period("granted", NOW + DAY, NOW + 30 * DAY)

    assert subscription_state([upcoming], NOW).status == "expired"


def test_extension_starts_after_current_coverage():
    trial = trial_period(NOW - DAY, 14)

    assert extension_start([trial], NOW) == trial.ends_at
    assert extension_start([Period("trial", NOW - 30 * DAY, NOW - DAY)], NOW) == NOW
