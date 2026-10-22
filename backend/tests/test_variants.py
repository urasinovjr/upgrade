from decimal import Decimal

import pytest

from app.analysis.pipeline import RunRecord
from app.analysis.sim_provider import MODEL, PROMPT_VERSION, PROVIDER_NAME, SimDraftProvider
from app.analysis.variants import (
    VARIANTS,
    UnknownVariant,
    Variant,
    code_commit,
    get_variant,
    make_provider,
)


def test_sim_variant_matches_the_simulator():
    variant = get_variant("sim")

    assert (variant.provider, variant.model, variant.prompt_version) == (
        PROVIDER_NAME,
        MODEL,
        PROMPT_VERSION,
    )
    assert variant.price_input_per_mtok == variant.price_output_per_mtok == 0


def test_unknown_variant_is_refused():
    with pytest.raises(UnknownVariant):
        get_variant("missing")


def test_every_variant_is_registered_by_its_name():
    assert all(name == variant.name for name, variant in VARIANTS.items())


async def test_sim_variant_builds_the_simulator_client(test_settings):
    provider = make_provider(get_variant("sim"), test_settings)
    try:
        assert isinstance(provider, SimDraftProvider)
    finally:
        await provider.close()


def test_run_is_priced_by_its_variant():
    variant = Variant(
        name="priced",
        kind="sim",
        provider="p",
        model="m",
        prompt_version="v",
        price_input_per_mtok=Decimal(200),
        price_output_per_mtok=Decimal(300),
    )
    record = RunRecord(input_tokens=10_000, output_tokens=2_000)

    record.price(variant)

    assert record.cost == Decimal("2.6")
    assert record.cost_currency == "RUB"


def test_commit_comes_from_settings_first(test_settings):
    settings = test_settings.model_copy(update={"app_commit": "abc1234"})

    assert code_commit(settings) == "abc1234"


def test_commit_falls_back_to_git(test_settings):
    commit = code_commit(test_settings.model_copy(update={"app_commit": ""}))

    assert commit
    assert commit != "abc1234"
