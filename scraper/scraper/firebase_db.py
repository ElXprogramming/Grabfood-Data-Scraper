"""Firestore Database Adapter for Menu Scraper
Manages syncing restaurant metadata and scraped menu items to Google Cloud Firestore.
Loads credentials safely from credentials/serviceAccountKey.json or GOOGLE_APPLICATION_CREDENTIALS.
"""
from __future__ import annotations

import logging
import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger("scraper.firebase")

_db: Optional[Any] = None

CREDENTIAL_CANDIDATE_PATHS = [
    Path("credentials/serviceAccountKey.json"),
    Path("../credentials/serviceAccountKey.json"),
    Path("serviceAccountKey.json"),
    Path("../serviceAccountKey.json"),
]


def get_firestore_client() -> Optional[Any]:
    """Initialize and return the Firestore client singleton."""
    global _db
    if _db is not None:
        return _db

    # Check environment variable first
    env_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    cred_file: Optional[Path] = None

    if env_path and Path(env_path).is_file():
        cred_file = Path(env_path)
    else:
        for candidate in CREDENTIAL_CANDIDATE_PATHS:
            if candidate.is_file():
                cred_file = candidate
                break

    if not cred_file:
        logger.info("No Firebase service account key found; skipping Firestore operations.")
        return None

    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(str(cred_file))
            firebase_admin.initialize_app(cred)

        _db = firestore.client()
        return _db
    except Exception as e:
        logger.warning(f"Failed to initialize Firebase Admin SDK: {e}")
        return None



def sync_restaurant_to_firestore(record: Dict[str, Any], restaurant_id: Optional[int] = None) -> Optional[str]:
    """Upsert restaurant metadata document into Firestore 'restaurants' collection."""
    db = get_firestore_client()
    if not db:
        return None

    doc_id = f"rest_{restaurant_id}" if restaurant_id else _slugify(record.get("name", "unknown"))
    doc_ref = db.collection("restaurants").document(doc_id)

    payload = {
        "name": record.get("name"),
        "area": record.get("area"),
        "rating": record.get("rating"),
        "cuisine": record.get("cuisine"),
        "opening_hours": record.get("opening_hours"),
        "address": record.get("address"),
        "location": {
            "lat": record.get("lat"),
            "lon": record.get("lon"),
        } if record.get("lat") is not None and record.get("lon") is not None else None,
        "grab_url": record.get("grab_url"),
        "foodpanda_url": record.get("foodpanda_url"),
        "website": record.get("website"),
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    # Clean None values from top-level to prevent clutter
    clean_payload = {k: v for k, v in payload.items() if v is not None}
    doc_ref.set(clean_payload, merge=True)
    return doc_id


def sync_menu_items_to_firestore(
    restaurant_doc_id: str,
    restaurant_name: str,
    items: List[Dict[str, Any]],
    source: str = "web",
) -> int:
    """Batch-upsert menu items into Firestore 'menu_items' collection."""
    db = get_firestore_client()
    if not db or not items:
        return 0

    batch = db.batch()
    batch_count = 0
    total_saved = 0

    for idx, item in enumerate(items):
        item_name = item.get("name", "").strip()
        if not item_name:
            continue

        item_id = f"{restaurant_doc_id}_item_{idx + 1}"
        doc_ref = db.collection("menu_items").document(item_id)

        item_data = {
            "restaurant_id": restaurant_doc_id,
            "restaurant_name": restaurant_name,
            "name": item_name,
            "category": item.get("category") or "General",
            "price": item.get("price", 0.0),
            "currency": item.get("currency") or "MYR",
            "description": item.get("description") or "",
            "source": source,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }

        batch.set(doc_ref, item_data, merge=True)
        batch_count += 1
        total_saved += 1

        # Firestore batches have a hard ceiling of 500 operations
        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()

    # Update item count on restaurant document
    try:
        db.collection("restaurants").document(restaurant_doc_id).set(
            {"item_count": total_saved, "last_synced_at": firestore.SERVER_TIMESTAMP},
            merge=True,
        )
    except Exception:
        pass

    return total_saved


def sync_sqlite_to_firestore(db_path: Path) -> Dict[str, Any]:
    """One-shot utility to migrate or sync all restaurants and dishes from SQLite to Firestore."""
    db = get_firestore_client()
    if not db:
        return {"success": False, "error": "Firestore is not connected."}

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    restaurants = conn.execute("SELECT * FROM restaurants").fetchall()
    rest_synced = 0
    items_synced = 0

    for r in restaurants:
        r_dict = dict(r)
        rest_id = r_dict.get("id")
        doc_id = sync_restaurant_to_firestore(r_dict, restaurant_id=rest_id)
        if not doc_id:
            continue
        rest_synced += 1

        # Fetch menu items for this restaurant
        item_rows = conn.execute(
            "SELECT * FROM menu_items WHERE restaurant_id = ?", (rest_id,)
        ).fetchall()

        if item_rows:
            items_list = [dict(it) for it in item_rows]
            src = items_list[0].get("source", "web")
            count = sync_menu_items_to_firestore(doc_id, r_dict["name"], items_list, source=src)
            items_synced += count

    conn.close()
    return {
        "success": True,
        "restaurants_synced": rest_synced,
        "items_synced": items_synced,
    }


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"[-\s]+", "-", text)[:60]

