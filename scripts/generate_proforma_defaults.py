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
    road_segments_path = DATA / "sheet1-road-segments.json"

    sf_sqft = sum(lot["squareFeet"] for lot in lots if lot.get("lotType") == "single-family")
    th_sqft = sum(lot["squareFeet"] for lot in lots if lot.get("lotType") == "townhome")
    residential_sqft = sf_sqft + th_sqft

    road_acres = 0.0
    road_centerline_lf = 0.0
    if road_segments_path.exists():
        road_segments = json.loads(road_segments_path.read_text(encoding="utf-8"))
        road_acres = road_segments.get("roadAcres", 0.0)
        road_centerline_lf = road_segments.get("centerlineLf", 0.0)

    return {
        "sf_acres": round(sf_sqft / 43560, 2),
        "th_acres": round(th_sqft / 43560, 2),
        "residential_acres": round(residential_sqft / 43560, 2),
        "road_acres": road_acres,
        "road_centerline_lf": road_centerline_lf,
        "total_project_acres": 52.0,
        "notes": (
            "Road area from plat PDF centerline annotations (sheet1-road-segments.json). "
            "Lot areas from plat S.F. labels and polygon scaling. "
            "Total project acreage (~52 ac) for reference; water rights budgeted per lot at 1.0 AF/lot."
        ),
    }


def main() -> None:
    project_xlsx = source(
        "12_11_23 Proforma Delta.xlsx",
        "Supporting Docs/Delta/12_11_23 Proforma Delta.xlsx",
        "Land $1.835M, engineering $110k, studies $17.5k.",
    )
    ordinance = source(
        "Ord. 2025-317 â€” Delta City Design & Construction Standards",
        "Supporting Docs/City Ordinances/1760410617_Ordinance 2025-317 Construction Standards.pdf",
        "ST-103 local roads, ST-113 utility placement, ST-131 sidewalks.",
    )
    millard_water = source(
        "Millard County Subdivision Ordinance Â§ 11-1-20",
        "https://millardcounty.gov/wp-content/uploads/2019/07/Plat-Subdivision-Application.pdf",
        "Minimum 1.0 acre-foot of culinary water dedicated to each proposed lot at plat approval.",
    )
    delta_water = source(
        "Delta City culinary water & water rights",
        "Supporting Docs/Delta/Utilities/Culinary/Water Rights/",
        "Culinary water rights purchased through Delta City for new connections.",
    )
    project_parcels = source(
        "Delta Crossings project parcel assembly",
        "Supporting Docs/Delta/",
        "~52 ac total across project parcels; commercial ~4 ac may be cited separately in studies.",
    )
    area_defaults = compute_plat_area_defaults()

    defaults = {
        "version": 3,
        "model": "for-sale",
        "description": (
            "For-sale proforma with ordinance-based infrastructure costing. "
            "Road area and centerline length from plat PDF annotations; "
            "quantities per Ord. 2025-317 (ST-103, ST-113, ST-131)."
        ),
        "phaseOrder": [1, 3, 4, 5, 6, 7],
        "platAreas": area_defaults,
        "ordinanceRef": {
            "title": "Ordinance 2025-317 â€” Delta City Design & Construction Standards",
            "path": "Supporting Docs/City Ordinances/1760410617_Ordinance 2025-317 Construction Standards.pdf",
            "drawings": [
                "ST-103 Local Roads (24' pavement; plat ROW 60')",
                "ST-113 Utility Locations",
                "ST-131 Sidewalks",
            ],
        },
        "assumptions": [
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
                4_000_000,
                "USD",
                "development",
                source(
                    "12_11_23 Proforma Delta.xlsx",
                    "Supporting Docs/Delta/12_11_23 Proforma Delta.xlsx",
                    "Source proforma listed land at $1.835M; $4.0M used here as an "
                    "intentional acquisition-budget override.",
                ),
                description=(
                    "Total land acquisition budget. Intentional $4.0M basis "
                    "(overrides the $1.835M line in the source proforma)."
                ),
            ),
            assumption(
                "water_rights_af_per_lot",
                "Culinary water requirement (per residential lot)",
                1.0,
                "AF/lot",
                "development",
                millard_water,
                description=(
                    "Millard County requires 1.0 acre-foot dedicated per platted lot "
                    "for culinary water feasibility at subdivision approval."
                ),
            ),
            assumption(
                "water_rights_cost_per_acre_foot",
                "Culinary water rights purchase (city rate)",
                10_000,
                "USD/AF",
                "development",
                delta_water,
                description="Cost to purchase culinary water rights from Delta City per acre-foot.",
            ),
            assumption(
                "sf_sale_price_per_sqft",
                "Single-family sale price",
                220,
                "USD/sqft",
                "revenue",
                source(
                    "Delta rural new-home market estimate",
                    "https://buildgenius.app/construction-costs/utah",
                    "â‰ˆ$220/sqft preserves prior ~$485k at ~2,200 sqft; sale price = dwelling sqft Ã— this rate.",
                ),
                description=(
                    "Sale price per dwelling square foot. Each home is priced as "
                    "dwelling sqft Ã— this rate."
                ),
            ),
            assumption(
                "townhome_sale_price_per_sqft",
                "Townhome sale price",
                252,
                "USD/sqft",
                "revenue",
                source(
                    "12_11_23 Proforma Delta.xlsx â€” Unit Mix",
                    "Supporting Docs/Delta/12_11_23 Proforma Delta.xlsx",
                    "â‰ˆ$252/sqft preserves prior ~$385k at ~1,525 sqft; sale price = dwelling sqft Ã— this rate.",
                ),
                description=(
                    "Sale price per dwelling square foot. Each home is priced as "
                    "dwelling sqft Ã— this rate."
                ),
            ),
            assumption(
                "sf_reserved_for_rent",
                "Single-family units reserved for rent",
                0,
                "units",
                "rental",
                project_xlsx,
                description="Held for rental income instead of sold. Reserved from latest phases first.",
            ),
            assumption(
                "townhome_reserved_for_rent",
                "Townhome units reserved for rent",
                0,
                "units",
                "rental",
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
                    "Labor represents 35â€“40% of hard costs; 10% burden on vertical.",
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
                    "Typical 5â€“10% waste allowance on materials.",
                ),
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
                    "Western States Market Study â€” Delta Apartments",
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
                    "Census/NAHB production built-for-sale average ~6–8 months; default 6 months.",
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
            # Infrastructure unit costs â€” ordinance dimensions are fixed in computeProforma.js
            assumption(
                "infrastructure_safety_factor",
                "Infrastructure safety factor",
                1.5,
                "x",
                "infrastructure",
                source(
                    "Planning contingency multiplier",
                    "",
                    "Default 1.5 = +50% contingency on all infrastructure line items.",
                ),
                description="Flat multiplier applied to all infrastructure line items. Use >1.0 for contingency / higher bids, <1.0 to stress cheaper costs.",
            ),
            assumption(
                "asphalt_paving_per_sqft",
                "Asphalt pavement (installed)",
                4.50,
                "USD/sqft",
                "infrastructure",
                source(
                    "Utah asphalt paving cost guide 2026",
                    "https://utahasphalt.com/asphalt-paving-cost-utah-2026/",
                    "Commercial-scale paving $3â€“$7/sqft; mid-range for subdivision streets.",
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
                    "$24â€“$31/LF installed concrete curb and gutter.",
                ),
            ),
            assumption(
                "sidewalk_concrete_per_sqft",
                "Concrete sidewalk 4\" (installed)",
                12,
                "USD/sqft",
                "infrastructure",
                source(
                    "ProMatcher Salt Lake City concrete report",
                    "https://concrete.promatcher.com/cost/salt-lake-city-ut-concrete-costs-prices.aspx",
                    "Public report shows $6.43/sqft (4\" reinforced sidewalk); default is higher for base course per ST-131.",
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
                129,
                "USD/LF",
                "infrastructure",
                source(
                    "Ogden City â€” Monroe Water Line bid tabulation",
                    "https://homesweetogden.ogdencity.com/DocumentCenter/View/25244/Monroe-WTR-Line-BIDTABFORM",
                    "Bid item 121: 8\" PVC C900 DR-18 installed $108â€“$149/LF (2023); default is mid-range planning value ($129).",
                ),
            ),
            assumption(
                "sewer_main_per_lf",
                "Sanitary sewer 8\" PVC (installed)",
                95,
                "USD/LF",
                "infrastructure",
                source(
                    "ProMatcher Utah sewer cost report",
                    "https://sewers.promatcher.com/cost/utah.aspx",
                    "Public report shows $63.18/LF ($55â€“$71) for trench replacement; default higher for new subdivision main per ST-113.",
                ),
            ),
            assumption(
                "storm_drain_per_lf",
                "Storm drain HDPE (installed)",
                135,
                "USD/LF",
                "infrastructure",
                source(
                    "Ogden City â€” Monroe Water Line storm bid tabulation",
                    "https://homesweetogden.ogdencity.com/DocumentCenter/View/25244/Monroe-WTR-Line-BIDTABFORM",
                    "Bid schedule 2 item 203: 15\" storm drain RCP installed $114â€“$155/LF (2023); default mid-range ($135).",
                ),
            ),
            assumption(
                "sewer_manhole_each",
                "Sewer manhole (precast)",
                6_200,
                "USD/each",
                "infrastructure",
                source(
                    "Moab City â€” North Sewer Line bid tabulation",
                    "https://www.moabcity.gov/AgendaCenter/ViewFile/Item/1191?fileID=2795",
                    "Bid items A8/A9: 4'â€“5' precast sewer manholes $5,393â€“$7,005 each (2019); default mid-range ($6,200). Spacing per Ord. 2025-317 ST-103.",
                ),
            ),
            assumption(
                "storm_manhole_each",
                "Storm drain manhole (precast)",
                9_650,
                "USD/each",
                "infrastructure",
                source(
                    "Ogden City â€” Monroe Water Line storm bid tabulation",
                    "https://homesweetogden.ogdencity.com/DocumentCenter/View/25244/Monroe-WTR-Line-BIDTABFORM",
                    "Bid item 202: 60\" precast storm drain manhole $8,050â€“$11,238 each (2023); default mid-range ($9,650). Spacing per Ord. 2025-317.",
                ),
            ),
            assumption(
                "utility_trench_per_lf",
                "Joint utility trenching (gas / power / telecom)",
                35,
                "USD/LF",
                "infrastructure",
                source(
                    "Moab City â€” North Sewer Line bid tabulation",
                    "https://www.moabcity.gov/AgendaCenter/ViewFile/Item/1191?fileID=2795",
                    "Excavation/backfill for joint trench only. Bid item A16 gas relocate $70â€“$130/LF (2019) informed lower joint-trench allowance.",
                ),
            ),
            assumption(
                "gas_main_per_lf",
                "Natural gas main PE (pipe & fittings)",
                55,
                "USD/LF",
                "infrastructure",
                source(
                    "Utah subdivision dry-utility planning allowances",
                    "Supporting Docs/Delta/",
                    "2â€“4\" PE gas main material + install in open joint trench (trench cost separate). Planning mid-range $45â€“$70/LF.",
                ),
            ),
            assumption(
                "electric_conduit_per_lf",
                "Electric primary/secondary conduit",
                32,
                "USD/LF",
                "infrastructure",
                source(
                    "Utah subdivision dry-utility planning allowances",
                    "Supporting Docs/Delta/",
                    "PVC conduit bank for power distribution (excl. trench). Cable often utility-furnished; default is developer conduit contribution.",
                ),
            ),
            assumption(
                "telecom_conduit_per_lf",
                "Telecom / fiber conduit",
                18,
                "USD/LF",
                "infrastructure",
                source(
                    "Utah subdivision dry-utility planning allowances",
                    "Supporting Docs/Delta/",
                    "Empty telecom/fiber conduit in joint trench (excl. trench). ISP may pull fiber later.",
                ),
            ),
            assumption(
                "electric_transformer_each",
                "Pad-mount transformer (installed)",
                12_000,
                "USD/each",
                "infrastructure",
                source(
                    "Utah subdivision dry-utility planning allowances",
                    "Supporting Docs/Delta/",
                    "Pad-mount transformer contribution ~1 per 8 lots. Often utility-owned with developer contribution; $8kâ€“$18k planning range.",
                ),
            ),
            assumption(
                "street_light_each",
                "Street light (pole, fixture & base)",
                4_500,
                "USD/each",
                "infrastructure",
                source(
                    "Utah subdivision street lighting allowances",
                    "Supporting Docs/Delta/",
                    "Pole, LED fixture, foundation, and wiring stub. Quantity at ~175' centerline spacing.",
                ),
            ),
            assumption(
                "townhome_rent_monthly",
                "Townhome rent (reserved units)",
                1_750,
                "USD/month",
                "rental",
                source(
                    "Western States Market Study â€” 3-bed townhome",
                    "Supporting Docs/Delta/Reports/Market Study.pdf",
                    "$1,750/mo market rent for 3-bed townhome.",
                ),
            ),
            assumption(
                "sf_rent_monthly",
                "Single-family rent (reserved units)",
                2_200,
                "USD/month",
                "rental",
                source(
                    "Western States Market Study â€” comparable rents",
                    "Supporting Docs/Delta/Reports/Market Study.pdf",
                    "Estimated market rent for reserved single-family units.",
                ),
            ),
            assumption(
                "rental_opex_per_unit_year",
                "Rental operating expenses",
                6_000,
                "USD/unit/year",
                "rental",
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
                "rental",
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
