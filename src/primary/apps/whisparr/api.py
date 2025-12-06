#!/usr/bin/env python3
"""
Whisparr-specific API functions
Handles all communication with the Whisparr API

This module has been refactored to use the base API client, tag manager,
and pagination helpers to eliminate code duplication across *arr apps.
Exclusively uses the Whisparr V3 API
"""

from typing import Any

import requests

# Import base modules for shared functionality
from src.primary.apps.base.api_client import ArrAPIClient
from src.primary.apps.base.pagination import PaginationHelper
from src.primary.apps.base.tag_manager import TagManager
from src.primary.utils.logger import get_logger

# Get logger for the Whisparr app
whisparr_logger = get_logger("whisparr")

# Initialize base client, tag manager, and pagination helper (Whisparr uses API v3 like Sonarr)
_api_client = ArrAPIClient("whisparr", api_version="v3", logger=whisparr_logger)
_tag_manager = TagManager(_api_client, entity_type="series")
_pagination_helper = PaginationHelper(_api_client)

# Keep session reference for backward compatibility with direct requests
session = _api_client.session

def arr_request(api_url: str, api_key: str, api_timeout: int, endpoint: str, method: str = "GET", data: dict | None = None, count_api: bool = True) -> Any:
    """
    Make a request to the Whisparr API.

    This is a thin wrapper around ArrAPIClient.request() for backward compatibility.

    Args:
        api_url: The base URL of the Whisparr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        endpoint: The API endpoint to call
        method: HTTP method (GET, POST, PUT, DELETE)
        data: Optional data payload for POST/PUT requests
        count_api: Whether to count this request toward the hourly API cap

    Returns:
        The parsed JSON response or None if the request failed
    """
    return _api_client.request(api_url, api_key, api_timeout, endpoint, method, data, count_api=count_api)

def get_download_queue_size(api_url: str, api_key: str, api_timeout: int) -> int:
    """
    Get the current size of the Whisparr download queue.

    This is a thin wrapper around ArrAPIClient.get_download_queue_size().
    """
    return _api_client.get_download_queue_size(api_url, api_key, api_timeout)

def get_items_with_missing(api_url: str, api_key: str, api_timeout: int, monitored_only: bool) -> list[dict[str, Any]]:
    """
    Get a list of items with missing files (not downloaded/available).

    Args:
        api_url: The base URL of the Whisparr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        monitored_only: If True, only return monitored items.

    Returns:
        A list of item objects with missing files, or None if the request failed.
    """
    try:
        whisparr_logger.debug("Retrieving missing items...")

        # Endpoint parameters - always use v2 format
        endpoint = "wanted/missing?pageSize=1000&sortKey=airDateUtc&sortDirection=descending"

        response = arr_request(api_url, api_key, api_timeout, endpoint, count_api=False)

        if response is None:
            return None

        # Extract the episodes/items
        items = []
        if isinstance(response, dict) and "records" in response:
            items = response["records"]

        # Filter monitored if needed
        if monitored_only:
            items = [item for item in items if item.get("monitored", False)]

        whisparr_logger.debug(f"Found {len(items)} missing items")
        return items

    except Exception as e:
        whisparr_logger.error(f"Error retrieving missing items: {e!s}")
        return None

def get_cutoff_unmet_items(api_url: str, api_key: str, api_timeout: int, monitored_only: bool) -> list[dict[str, Any]]:
    """
    Get a list of items that don't meet their quality profile cutoff.

    Args:
        api_url: The base URL of the Whisparr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        monitored_only: If True, only return monitored items.

    Returns:
        A list of item objects that need quality upgrades, or None if the request failed.
    """
    try:
        whisparr_logger.debug("Retrieving cutoff unmet items...")

        # Endpoint - always use v2 format
        endpoint = "wanted/cutoff?pageSize=1000&sortKey=airDateUtc&sortDirection=descending"

        response = arr_request(api_url, api_key, api_timeout, endpoint, count_api=False)

        if response is None:
            return None

        # Extract the episodes/items
        items = []
        if isinstance(response, dict) and "records" in response:
            items = response["records"]

        whisparr_logger.debug(f"Found {len(items)} cutoff unmet items")

        # Just filter monitored if needed
        if monitored_only:
            items = [item for item in items if item.get("monitored", False)]
            whisparr_logger.debug(f"Found {len(items)} cutoff unmet items after filtering monitored")

        return items

    except Exception as e:
        whisparr_logger.error(f"Error retrieving cutoff unmet items: {e!s}")
        return None

def refresh_item(api_url: str, api_key: str, api_timeout: int, item_id: int) -> int:
    """
    Refresh functionality has been removed as it was a performance bottleneck.
    This function now returns a placeholder command ID without making any API calls.

    Args:
        api_url: The base URL of the Whisparr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        item_id: The ID of the item to refresh

    Returns:
        A placeholder command ID (123) to simulate success
    """
    whisparr_logger.debug(f"Refresh functionality disabled for item ID: {item_id}")
    # Return a placeholder command ID to simulate success without actually refreshing
    return 123

def item_search(api_url: str, api_key: str, api_timeout: int, item_ids: list[int]) -> int:
    """
    Trigger a search for one or more items.

    Args:
        api_url: The base URL of the Whisparr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        item_ids: A list of item IDs to search for

    Returns:
        The command ID if the search command was triggered successfully, None otherwise
    """

    # Check API limit before making request
    try:
        from src.primary.stats_manager import check_hourly_cap_exceeded
        if check_hourly_cap_exceeded("whisparr"):
            whisparr_logger.warning(f"🛑 Whisparr API hourly limit reached - skipping item search for {len(item_ids)} items")
            return None
    except Exception as e:
        whisparr_logger.error(f"Error checking hourly API cap: {e}")
        # Continue with request if cap check fails - safer than skipping

    try:
        whisparr_logger.debug(f"Searching for items with IDs: {item_ids}")

        # Always use the same payload format since we're always using v2 API
        payload = {
            "name": "EpisodeSearch",
            "episodeIds": item_ids
        }

        # For commands, we need to directly try both path formats
        command_endpoint = "command"
        url = f"{api_url.rstrip('/')}/api/{command_endpoint}"
        backup_url = f"{api_url.rstrip('/')}/api/v3/{command_endpoint}"

        headers = {
            "X-Api-Key": api_key,
            "Content-Type": "application/json"
        }

        # Try standard API path first
        whisparr_logger.debug(f"Attempting command with standard API path: {url}")
        try:
            response = session.post(url, headers=headers, json=payload, timeout=api_timeout)
            # If we get a 404 or 405, try the v3 path
            if response.status_code in [404, 405]:
                whisparr_logger.debug(f"Standard path returned {response.status_code}, trying with V3 path: {backup_url}")
                response = session.post(backup_url, headers=headers, json=payload, timeout=api_timeout)

            response.raise_for_status()
            result = response.json()

            if result and "id" in result:
                command_id = result["id"]
                whisparr_logger.debug(f"Search command triggered with ID {command_id}")

                # Increment API counter after successful request
                try:
                    from src.primary.stats_manager import increment_hourly_cap
                    increment_hourly_cap("whisparr", 1)
                    whisparr_logger.debug(f"Incremented Whisparr hourly API cap for item search ({len(item_ids)} items)")
                except Exception as cap_error:
                    whisparr_logger.error(f"Failed to increment hourly API cap for item search: {cap_error}")

                return command_id
            else:
                whisparr_logger.error("Failed to trigger search command - no command ID returned")
                return None
        except requests.exceptions.HTTPError as e:
            whisparr_logger.error(f"HTTP error during search command: {e}, Status Code: {response.status_code}")
            whisparr_logger.debug(f"Response content: {response.text[:200]}")
            return None
        except Exception as e:
            whisparr_logger.error(f"Error sending search command: {e}")
            return None

    except Exception as e:
        whisparr_logger.error(f"Error searching for items: {e!s}")
        return None

def get_command_status(api_url: str, api_key: str, api_timeout: int, command_id: int) -> dict | None:
    """
    Get the status of a specific command.

    Args:
        api_url: The base URL of the Whisparr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        command_id: The ID of the command to check

    Returns:
        A dictionary containing the command status, or None if the request failed.
    """
    if not command_id:
        whisparr_logger.error("No command ID provided for status check.")
        return None

    try:
        # For commands, we need to directly try both path formats
        command_endpoint = f"command/{command_id}"
        url = f"{api_url.rstrip('/')}/api/{command_endpoint}"
        backup_url = f"{api_url.rstrip('/')}/api/v3/{command_endpoint}"

        headers = {
            "X-Api-Key": api_key,
            "Content-Type": "application/json"
        }

        # Try standard API path first
        whisparr_logger.debug(f"Checking command status with standard API path: {url}")
        try:
            response = session.get(url, headers=headers, timeout=api_timeout)
            # If we get a 404, try the v3 path
            if response.status_code == 404:
                whisparr_logger.debug(f"Standard path returned 404, trying with V3 path: {backup_url}")
                response = session.get(backup_url, headers=headers, timeout=api_timeout)

            response.raise_for_status()
            result = response.json()

            whisparr_logger.debug(f"Command {command_id} status: {result.get('status', 'unknown')}")
            return result
        except requests.exceptions.HTTPError as e:
            whisparr_logger.error(f"HTTP error getting command status: {e}, Status Code: {response.status_code}")
            whisparr_logger.debug(f"Response content: {response.text[:200]}")
            return None
        except Exception as e:
            whisparr_logger.error(f"Error getting command status: {e}")
            return None

    except Exception as e:
        whisparr_logger.error(f"Error getting command status for ID {command_id}: {e}")
        return None

def check_connection(api_url: str, api_key: str, api_timeout: int) -> bool:
    """
    Check the connection to Whisparr API.

    This is a thin wrapper around ArrAPIClient.check_connection().
    """
    return _api_client.check_connection(api_url, api_key, api_timeout)


def get_or_create_tag(api_url: str, api_key: str, api_timeout: int, tag_label: str) -> int | None:
    """
    Get existing tag ID or create a new tag in Whisparr.

    This is a thin wrapper around TagManager.get_or_create_tag().
    """
    return _tag_manager.get_or_create_tag(api_url, api_key, api_timeout, tag_label)


def add_tag_to_series(api_url: str, api_key: str, api_timeout: int, series_id: int, tag_id: int) -> bool:
    """
    Add a tag to a series in Whisparr.

    This is a thin wrapper around TagManager.add_tag_to_entity().
    """
    return _tag_manager.add_tag_to_entity(api_url, api_key, api_timeout, series_id, tag_id)


def tag_processed_series(api_url: str, api_key: str, api_timeout: int, series_id: int, tag_label: str = "huntarr-missing") -> bool:
    """
    Tag a series in Whisparr with the specified tag.

    This is a thin wrapper around TagManager.tag_processed_entity().
    """
    return _tag_manager.tag_processed_entity(api_url, api_key, api_timeout, series_id, tag_label)

def get_quality_profiles(api_url: str, api_key: str, api_timeout: int) -> list[dict] | None:
    """
    Get all quality profiles configured in Whisparr.

    This is a thin wrapper around ArrAPIClient.get_quality_profiles().
    """
    return _api_client.get_quality_profiles(api_url, api_key, api_timeout)
