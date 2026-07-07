#!/usr/bin/env python3
"""Generate proforma-defaults.json from project spreadsheets and cited benchmarks."""

from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "data" / "proforma-defaults.json"
DATA = ROOT / "web" / "data"


def source(name: str, url: str, notes: str = "") -> dict:
    return {
        "name": name,
        "url": url,
        "retrieved": date.today().isoformat(),
        "notes": notes,
    }


def assumption(
    assumption_id: str,
    label: str,
    value: float | int | str,
    unit: str,
    category: str,
    src: dict,
    *,
    description: str = "",
) -> dict:
    return {
        "id": assumption_id,
        "label": label,
        "value": value,
        "default": value,
        "unit": unit,
        "category": category,
        "description": description,
        "source": src,
        "overridable": True,
    }


def compute_plat_area_defaults() -> dict:
    lots = json.loads((DATA / "sheet1-lots.json").read_text(encoding="utf-8"))

    sf_sqft = sum(lot["squareFeet"] for lot in lots if lot.get("lotType") == "single-family")
    th_sqft = sum(lot["squareFeet"] for lot in lots if lot.get("lotType") == "townhome")
    residential_sqft = sf_sqft + th_sqft

    # Project parcel assembly (~52 ac). Market-study / study-doc acreages may
    # cover different portions (e.g. commercial zoning excluded).
    total_sqft = 52.0 * 43560
    commercial_sqft = 0.0
    designated_sqft = 0.0
    road_sqft = max(0.0, total_sqft - residential_sqft - commercial_sqft - designated_sqft)

    return {
        "sf_acres": round(sf_sqft / 43560, 2),
        "th_acres": round(th_sqft / 43560, 2),
        "residential_acres": round(residential_sqft / 43560, 2),
        "commercial_acres": 0.0,
        "designated_acres": 0.0,
        "total_site_acres": 52.0,
        "road_acres": round(road_sqft / 43560, 2),
        "notes": (
            "Total site is the ~52 ac residential parcel assembly. Commercial (~4 ac) and "
            "designated areas are editable assumptions; study documents may cite different scopes."
        ),
    }


def main() -> None:
    project_xlsx = source(
        "12_11_23 Proforma Delta.xlsx",
        "Supporting Docs/Delta/12_11_23 Proforma Delta.xlsx",
        "Land $1.835M, engineering $110k, studies $17.5k.",
    )
    ordinance = source(
        "Ord. 2025-317 — Delta City Design & Construction Standards",
        "Supporting Docs/City Ordinances/1760410617_Ordinance 2025-317 Construction Standards.pdf",
        "ST-103 local roads, ST-113 utility placement, ST-131 sidewalks.",
    )
    project_parcels = source(
        "Delta Crossings project parcel assembly",
        "Supporting Docs/Delta/",
        "~52 ac total across project parcels; commercial ~4 ac may be cited separately in studies.",
    )
    area_defaults = compute_plat_area_defaults()

    defaults = {
        "version": 2,
        "model": "for-sale",
        "description": (
            "For-sale proforma with ordinance-based infrastructure costing. "
            "Road area = total site acreage minus single-family, townhome, commercial, "
            "and designated areas."
        ),
        "phaseOrder": [1, 3, 4, 5, 6, 7],
        "platAreas": area_defaults,
        "ordinanceRef": {
            "title": "Ordinance 2025-317 — Delta City Design & Construction Standards",
            "path": "Supporting Docs/City Ordinances/1760410617_Ordinance 2025-317 Construction Standards.pdf",
            "drawings": ["ST-103 Local Roads (50' ROW)", "ST-113 Utility Locations", "ST-131 Sidewalks"],
        },
        "assumptions": [
            assumption(
                "total_site_acres",
                "Total plat acreage",
                52.0,
                "acres",
                "site_area",
                project_parcels,
                description=(
                    "~52 ac project parcel assembly. Study documents may cite different "
                    f"scopes (SF+TH lots annotate to {area_defaults['residential_acres']} ac)."
                ),
            ),
            assumption(
                "commercial_site_acres",
                "Commercial area (within project)",
                0.0,
                "acres",
                "site_area",
                project_parcels,
                description=(
                    "~4 ac commercial zoning, often outside the 52 ac residential assembly "
                    "and excluded from study-doc totals. Set if within the 52 ac site."
                ),
            ),
            assumption(
                "designated_site_acres",
                "Designated area (canal, parks, open space)",
                0.0,
                "acres",
                "site_area",
                project_parcels,
                description="Non-lot designated parcels within the site. Set per survey if known.",
            ),
            assumption(
                "initial_equity",
                "Starting equity / cash",
                500_000,
                "USD",
                "financing",
                project_xlsx,
                description="Cash on hand before phase 1 construction.",
            ),
            assumption(
                "land_cost_total",
                "Land acquisition (total)",
                1_835_000,
                "USD",
                "development",
                project_xlsx,
            ),
            assumption(
                "engineering_total",
                "Engineering & design (total)",
                110_000,
                "USD",
                "development",
                project_xlsx,
            ),
            assumption(
                "studies_total",
                "Studies & reports (total)",
                17_500,
                "USD",
                "development",
                project_xlsx,
            ),
            assumption(
                "sf_sale_price",
                "Single-family sale price",
                485_000,
                "USD/home",
                "revenue",
                source(
                    "Delta rural new-home market estimate",
                    "https://buildgenius.app/construction-costs/utah",
                    "Construction ~$168/sqft × ~2,200 sqft + land/infra margin for Millard County.",
                ),
            ),
            assumption(
                "townhome_sale_price",
                "Townhome sale price",
                385_000,
                "USD/home",
                "revenue",
                source(
                    "12_11_23 Proforma Delta.xlsx — Unit Mix",
                    "Supporting Docs/Delta/12_11_23 Proforma Delta.xlsx",
                    "Townhome unit revenue scaled to full home pricing; adjust for market.",
                ),
            ),
            assumption(
                "sf_reserved_for_rent",
                "Single-family units reserved for rent",
                0,
                "units",
                "rental_reserve",
                project_xlsx,
                description="Held for rental income instead of sold. Reserved from latest phases first.",
            ),
            assumption(
                "townhome_reserved_for_rent",
                "Townhome units reserved for rent",
                0,
                "units",
                "rental_reserve",
                project_xlsx,
                description="Held for rental income instead of sold. Reserved from latest phases first.",
            ),
            assumption(
                "sf_construction_cost_per_sqft",
                "Single-family vertical construction",
                168,
                "USD/sqft",
                "vertical_construction",
                source(
                    "BuildGenius Utah Construction Costs 2026",
                    "https://buildgenius.app/construction-costs/utah",
                    "Standard finish single-family; Utah cost index 102%.",
                ),
            ),
            assumption(
                "labor_overhead_pct",
                "Labor burden & contractor O&P",
                0.10,
                "ratio",
                "vertical_construction",
                source(
                    "NAHB cost breakdown guidance",
                    "https://www.nahb.org/",
                    "Labor represents 35–40% of hard costs; 10% burden on vertical.",
                ),
            ),
            assumption(
                "material_waste_pct",
                "Material waste factor",
                0.07,
                "ratio",
                "vertical_construction",
                source(
                    "RSMeans residential estimating practice",
                    "https://www.rsmeans.com/2026-residential-costs-book",
                    "Typical 5–10% waste allowance on materials.",
                ),
            ),
            assumption(
                "soft_cost_pct",
                "Soft costs (% of hard costs)",
                0.08,
                "ratio",
                "soft_costs",
                project_xlsx,
                description="Permits, insurance, legal, project management.",
            ),
            assumption(
                "contingency_pct",
                "Contingency (% of direct costs)",
                0.05,
                "ratio",
                "soft_costs",
                project_xlsx,
            ),
            assumption(
                "construction_loan_rate",
                "Construction loan interest rate",
                0.085,
                "ratio/year",
                "financing",
                source(
                    "Construction financing market (2026)",
                    "https://www.nahb.org/",
                    "Adjust for lender quotes.",
                ),
            ),
            assumption(
                "construction_loan_advance_pct",
                "Max loan advance (% of phase cost)",
                0.70,
                "ratio",
                "financing",
                project_xlsx,
            ),
            assumption(
                "homes_sold_per_month",
                "Home absorption rate",
                3,
                "homes/month",
                "schedule",
                source(
                    "Western States Market Study — Delta Apartments",
                    "Supporting Docs/Delta/Reports/Market Study.pdf",
                    "Market study projects ~10 units/month multifamily; for-sale assumed lower.",
                ),
            ),
            assumption(
                "months_to_build_home",
                "Months to build one home",
                6,
                "months",
                "schedule",
                source(
                    "Production home builder cycle",
                    "https://www.nahb.org/",
                    "Standard stick-built production timeline.",
                ),
            ),
            assumption(
                "parallel_homes_per_phase",
                "Homes under construction simultaneously (per phase)",
                6,
                "homes",
                "schedule",
                project_xlsx,
            ),
            # Ordinance dimensions (ST-103, ST-131, ST-113)
            assumption(
                "row_width_ft",
                "Right-of-way width (local road, ST-103)",
                50,
                "feet",
                "infrastructure",
                ordinance,
                description="50' local road typical section per Ord. 2025-317 ST-103.",
            ),
            assumption(
                "pavement_width_ft",
                "Pavement width (local road, ST-103)",
                24,
                "feet",
                "infrastructure",
                ordinance,
            ),
            assumption(
                "sidewalk_width_ft",
                "Sidewalk width (ST-131)",
                5,
                "feet",
                "infrastructure",
                ordinance,
                description='4" concrete sidewalk against curb per ST-131.',
            ),
            assumption(
                "sewer_manhole_spacing_ft",
                "Max sewer manhole spacing",
                350,
                "feet",
                "infrastructure",
                ordinance,
                description="PVC sewer mains; max 350' between manholes per Ord. 2025-317.",
            ),
            assumption(
                "storm_network_coverage_pct",
                "Storm drain coverage (% of road network)",
                0.85,
                "ratio",
                "infrastructure",
                ordinance,
                description="Share of road centerline receiving storm drain per typical subdivision layout.",
            ),
            # Unit costs — cited installed pricing
            assumption(
                "asphalt_paving_per_sqft",
                "Asphalt pavement (installed)",
                4.50,
                "USD/sqft",
                "infrastructure",
                source(
                    "Utah asphalt paving cost guide 2026",
                    "https://utahasphalt.com/asphalt-paving-cost-utah-2026/",
                    "Commercial-scale paving $3–$7/sqft; mid-range for subdivision streets.",
                ),
            ),
            assumption(
                "curb_gutter_per_lf",
                "Curb & gutter (installed)",
                27,
                "USD/LF",
                "infrastructure",
                source(
                    "ProMatcher Salt Lake City curbing report",
                    "https://curbing.promatcher.com/cost/salt-lake-city-ut-curbing-costs-prices.aspx",
                    "$24–$31/LF installed concrete curb and gutter.",
                ),
            ),
            assumption(
                "sidewalk_concrete_per_sqft",
                "Concrete sidewalk 4\" (installed)",
                12,
                "USD/sqft",
                "infrastructure",
                source(
                    "RSMeans / Utah concrete flatwork benchmarks",
                    "https://www.rsmeans.com/2026-square-foot-costs-book",
                    "4\" sidewalk with base course per ST-131.",
                ),
            ),
            assumption(
                "road_grading_per_sqft",
                "Road corridor grading & base",
                1.25,
                "USD/sqft",
                "infrastructure",
                source(
                    "Utah earthwork & base course benchmarks",
                    "https://utahasphalt.com/asphalt-paving-cost-utah-2026/",
                    "Grading, granular borrow, and base course under pavement.",
                ),
            ),
            assumption(
                "water_main_per_lf",
                "Culinary water main 8\" PVC (installed)",
                85,
                "USD/LF",
                "infrastructure",
                source(
                    "Utah water main installation benchmarks",
                    "https://www.rsmeans.com/2026-square-foot-costs-book",
                    "AWWA C900 PVC blue pipe per Ord. 2025-317; one side of street.",
                ),
            ),
            assumption(
                "sewer_main_per_lf",
                "Sanitary sewer 8\" PVC (installed)",
                95,
                "USD/LF",
                "infrastructure",
                source(
                    "Utah sewer main installation benchmarks",
                    "https://www.rsmeans.com/2026-square-foot-costs-book",
                    "PVC sewer opposite water line per ST-113.",
                ),
            ),
            assumption(
                "storm_drain_per_lf",
                "Storm drain HDPE (installed)",
                75,
                "USD/LF",
                "infrastructure",
                source(
                    "Utah storm drain installation benchmarks",
                    "https://www.rsmeans.com/2026-square-foot-costs-book",
                    "Black corrugated HDPE per Ord. 2025-317.",
                ),
            ),
            assumption(
                "sewer_manhole_each",
                "Sewer manhole (precast)",
                4_500,
                "USD/each",
                "infrastructure",
                ordinance,
            ),
            assumption(
                "storm_manhole_each",
                "Storm drain manhole (precast)",
                5_500,
                "USD/each",
                "infrastructure",
                ordinance,
            ),
            assumption(
                "utility_trench_per_lf",
                "Gas / power / telecom trenching",
                35,
                "USD/LF",
                "infrastructure",
                source(
                    "Utah utility trenching benchmarks",
                    "https://www.rsmeans.com/2026-square-foot-costs-book",
                    "Joint trench allowance along road corridor.",
                ),
            ),
            assumption(
                "townhome_rent_monthly",
                "Townhome rent (reserved units)",
                1_750,
                "USD/month",
                "rental_holdout",
                source(
                    "Western States Market Study — 3-bed townhome",
                    "Supporting Docs/Delta/Reports/Market Study.pdf",
                    "$1,750/mo market rent for 3-bed townhome.",
                ),
            ),
            assumption(
                "sf_rent_monthly",
                "Single-family rent (reserved units)",
                2_200,
                "USD/month",
                "rental_holdout",
                source(
                    "Western States Market Study — comparable rents",
                    "Supporting Docs/Delta/Reports/Market Study.pdf",
                    "Estimated market rent for reserved single-family units.",
                ),
            ),
            assumption(
                "rental_opex_per_unit_year",
                "Rental operating expenses",
                6_000,
                "USD/unit/year",
                "rental_holdout",
                source(
                    "Western States Market Study",
                    "Supporting Docs/Delta/Reports/Market Study.pdf",
                    "Projected opex $6,000/unit/year.",
                ),
            ),
            assumption(
                "rental_vacancy_pct",
                "Rental vacancy & credit loss",
                0.05,
                "ratio",
                "rental_holdout",
                source(
                    "Western States Market Study",
                    "Supporting Docs/Delta/Reports/Market Study.pdf",
                ),
            ),
        ],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(defaults, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"Plat areas: {area_defaults}")


if __name__ == "__main__":
    main()
