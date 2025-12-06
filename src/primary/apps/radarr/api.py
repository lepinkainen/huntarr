#!/usr/bin/env python3
"""
Radarr-specific API functions
Handles all communication with the Radarr API

This module has been refactored to use the base API client, tag manager,
and pagination helpers to eliminate code duplication across *arr apps.
"""

import time
from typing import Any

# Import base modules for shared functionality
from src.primary.apps.base.api_client import ArrAPIClient
from src.primary.apps.base.pagination import PaginationHelper
from src.primary.apps.base.tag_manager import TagManager
from src.primary.utils.logger import get_logger

# Get logger for the Radarr app
radarr_logger = get_logger("radarr")

# Initialize base client, tag manager, and pagination helper
_api_client = ArrAPIClient("radarr", api_version="v3", logger=radarr_logger)
_tag_manager = TagManager(_api_client, entity_type="movie")
_pagination_helper = PaginationHelper(_api_client)

# Keep session reference for backward compatibility with direct requests
session = _api_client.session

def arr_request(api_url: str, api_key: str, api_timeout: int, endpoint: str, method: str = "GET", data: dict | None = None, params: dict | None = None, count_api: bool = True) -> Any:
    """
    Make a request to the Radarr API.

    This is a thin wrapper around ArrAPIClient.request() for backward compatibility.
    Note: Radarr checks API limit before making request (check_limit_before=True).

    Args:
        api_url: The base URL of the Radarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        endpoint: The API endpoint to call (without /api/v3/)
        method: HTTP method (GET, POST, PUT, DELETE)
        data: Optional data payload for POST/PUT requests
        params: Optional query parameters for GET requests
        count_api: Whether the request counts toward API tally

    Returns:
        The parsed JSON response or None if the request failed
    """
    return _api_client.request(
        api_url, api_key, api_timeout, endpoint, method, data,
        params=params, count_api=count_api, check_limit_before=True
    )

def get_download_queue_size(api_url: str, api_key: str, api_timeout: int) -> int:
    """
    Get the current size of the Radarr download queue.

    This is a thin wrapper around ArrAPIClient.get_download_queue_size().
    """
    return _api_client.get_download_queue_size(api_url, api_key, api_timeout)


def get_quality_profiles(api_url: str, api_key: str, api_timeout: int) -> list[dict] | None:
    """
    Get all quality profiles configured in Radarr.

    This is a thin wrapper around ArrAPIClient.get_quality_profiles().
    """
    return _api_client.get_quality_profiles(api_url, api_key, api_timeout)

def get_quality_profile_names(api_url: str, api_key: str, api_timeout: int) -> list[str]:
    """
    Get a simple list of quality profile names for UI dropdowns.

    Args:
        api_url: The base URL of the Radarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request

    Returns:
        A list of quality profile names, or empty list if the request failed.
    """
    profiles = get_quality_profiles(api_url, api_key, api_timeout)
    if profiles is None:
        return []

    return [profile.get('name', 'Unknown') for profile in profiles]

def get_movies_with_missing(api_url: str, api_key: str, api_timeout: int, monitored_only: bool) -> list[dict] | None:
    """
    Get a list of movies with missing files (not downloaded/available).

    Args:
        api_url: The base URL of the Radarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        monitored_only: If True, only return monitored movies.

    Returns:
        A list of movie objects with missing files, or None if the request failed.
    """
    # Use the updated arr_request with passed arguments
    # Use arr_request with count_api=False for data fetching (doesn't count toward API tally)
    movies = arr_request(api_url, api_key, api_timeout, "movie", count_api=False)
    if movies is None: # Check for None explicitly, as an empty list is valid
        radarr_logger.error("Failed to retrieve movies from Radarr API.")
        return None

    missing_movies = []
    for movie in movies:
        is_monitored = movie.get("monitored", False)
        has_file = movie.get("hasFile", False)
        # Apply monitored_only filter if requested
        if not has_file and (not monitored_only or is_monitored):
            missing_movies.append(movie)

    radarr_logger.debug(f"Found {len(missing_movies)} missing movies (monitored_only={monitored_only}).")
    return missing_movies

def get_cutoff_unmet_movies(api_url: str, api_key: str, api_timeout: int, monitored_only: bool) -> list[dict] | None:
    """
    Get a list of movies that don't meet their quality profile cutoff using the proper API endpoint.

    Args:
        api_url: The base URL of the Radarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        monitored_only: If True, only return monitored movies.

    Returns:
        A list of movie objects that need quality upgrades, or None if the request failed.
    """
    # Use Radarr's dedicated cutoff endpoint
    radarr_logger.debug(f"Fetching cutoff unmet movies (monitored_only={monitored_only})...")

    # Set up pagination parameters - start with reasonable page size
    page = 1
    page_size = 100  # Reasonable batch size for processing
    all_cutoff_movies = []

    while True:
        # Use the proper wanted/cutoff endpoint with pagination
        params = {
            'page': page,
            'pageSize': page_size,
            'monitored': monitored_only
        }

        # Use arr_request for proper API tracking and limit checking
        response = arr_request(api_url, api_key, api_timeout, "wanted/cutoff", params=params, count_api=False)

        if response is None:
            radarr_logger.error("Failed to retrieve cutoff unmet movies from Radarr API.")
            return None if page == 1 else all_cutoff_movies  # Return partial results if we got some data

        # Handle paginated response structure
        records = response.get('records', [])
        total_records = response.get('totalRecords', 0)

        if not records:
            break  # No more records

        all_cutoff_movies.extend(records)

        # Log progress for large datasets
        if total_records > page_size:
            radarr_logger.debug(f"Retrieved {len(all_cutoff_movies)}/{total_records} cutoff unmet movies...")

        # Check if we've got all records
        if len(all_cutoff_movies) >= total_records:
            break

        page += 1

        # Safety check to prevent infinite loops
        if page > 1000:  # Reasonable upper limit
            radarr_logger.warning("Reached maximum page limit (1000) while fetching cutoff unmet movies")
            break

    radarr_logger.debug(f"Found {len(all_cutoff_movies)} cutoff unmet movies (monitored_only={monitored_only}).")
    return all_cutoff_movies

def get_cutoff_unmet_movies_random_page(api_url: str, api_key: str, api_timeout: int, monitored_only: bool, count: int = 50) -> list[dict] | None:
    """
    Get a random sample of cutoff unmet movies from a random page instead of fetching all pages.
    This dramatically reduces API calls while still providing fair movie selection.
    Note: Uses count_api=False for page fetching so only upgrade requests count toward API tally.

    Args:
        api_url: Radarr API URL
        api_key: Radarr API key
        api_timeout: Request timeout in seconds
        monitored_only: Only return monitored movies
        count: Maximum number of movies to return (default: 50)

    Returns:
        List of movie dictionaries representing cutoff unmet movies, or None if error
    """
    import random

    radarr_logger.debug(f"Fetching random sample of cutoff unmet movies (monitored_only={monitored_only}, count={count})...")

    # First, get the first page to determine total pages/records
    params = {
        'page': 1,
        'pageSize': count,  # Use requested count as page size
        'monitored': monitored_only
    }

    # Use arr_request for proper API tracking and limit checking
    response = arr_request(api_url, api_key, api_timeout, "wanted/cutoff", params=params, count_api=False)

    if response is None:
        radarr_logger.error("Failed to retrieve cutoff unmet movies from Radarr API.")
        return None

    records = response.get('records', [])
    total_records = response.get('totalRecords', 0)
    page_size = count
    total_pages = max(1, (total_records + page_size - 1) // page_size)  # Calculate total pages

    radarr_logger.info(f"📊 Found {total_records} total cutoff unmet movies across {total_pages} pages")

    # If we have few enough records that they fit in one page, just return them
    if total_records <= page_size:
        radarr_logger.info(f"🎯 All {len(records)} movies fit in one page, returning them directly")
        return records

    # Pick a random page (excluding page 1 since we already have it)
    if total_pages > 1:
        random_page = random.randint(1, total_pages)
        radarr_logger.info(f"🎲 Randomly selected page {random_page} of {total_pages}")

        # If we didn't pick page 1, fetch the random page
        if random_page != 1:
            params['page'] = random_page
            response = arr_request(api_url, api_key, api_timeout, "wanted/cutoff", params=params, count_api=False)

            if response is None:
                radarr_logger.warning(f"Failed to fetch random page {random_page}, using page 1 data")
                # Fall back to page 1 data we already have
            else:
                records = response.get('records', [])
                radarr_logger.info(f"📄 Retrieved {len(records)} movies from page {random_page}")

    # Randomly sample from the page if we have more than requested
    if len(records) > count:
        records = random.sample(records, count)
        radarr_logger.info(f"🎯 Randomly selected {len(records)} movies from the page")

    radarr_logger.info(f"✅ Returning {len(records)} cutoff unmet movies from random sampling")
    return records

def refresh_movie(api_url: str, api_key: str, api_timeout: int, movie_id: int,
                 command_wait_delay: int = 1, command_wait_attempts: int = 600) -> int | None:
    """
    Refresh functionality has been removed as it was a performance bottleneck.
    This function now returns a placeholder success value without making any API calls.

    Args:
        api_url: The base URL of the Radarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        movie_id: The ID of the movie to refresh
        command_wait_delay: Seconds to wait between command status checks
        command_wait_attempts: Maximum number of status check attempts

    Returns:
        A placeholder command ID (123) to simulate success
    """
    radarr_logger.debug(f"Refresh functionality disabled for movie ID: {movie_id}")
    # Return a placeholder command ID (123) to simulate success without actually refreshing
    return 123

def movie_search(api_url: str, api_key: str, api_timeout: int, movie_ids: list[int]) -> int | None:
    """
    Trigger a search for one or more movies.

    Args:
        api_url: The base URL of the Radarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        movie_ids: A list of movie IDs to search for

    Returns:
        The command ID if the search command was triggered successfully, None otherwise
    """
    if not movie_ids:
        radarr_logger.warning("No movie IDs provided for search.")
        return None

    endpoint = "command"
    data = {
        "name": "MoviesSearch",
        "movieIds": movie_ids
    }

    # Use the updated arr_request
    response = arr_request(api_url, api_key, api_timeout, endpoint, method="POST", data=data)
    if response and 'id' in response:
        command_id = response['id']
        radarr_logger.debug(f"Triggered search for movie IDs: {movie_ids}. Command ID: {command_id}")
        return command_id
    else:
        radarr_logger.error(f"Failed to trigger search command for movie IDs {movie_ids}. Response: {response}")
        return None

def check_connection(api_url: str, api_key: str, api_timeout: int) -> bool:
    """
    Check the connection to Radarr API.

    This is a thin wrapper around ArrAPIClient.check_connection().
    """
    return _api_client.check_connection(api_url, api_key, api_timeout)

def wait_for_command(api_url: str, api_key: str, api_timeout: int, command_id: int,
                    delay_seconds: int = 1, max_attempts: int = 600) -> bool:
    """
    Wait for a command to complete.

    Args:
        api_url: The base URL of the Radarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        command_id: The ID of the command to wait for
        delay_seconds: Seconds to wait between command status checks
        max_attempts: Maximum number of status check attempts

    Returns:
        True if the command completed successfully, False if timed out
    """
    attempts = 0
    while attempts < max_attempts:
        response = arr_request(api_url, api_key, api_timeout, f"command/{command_id}")
        if response and 'state' in response:
            state = response['state']
            if state == "completed":
                return True
            elif state == "failed":
                radarr_logger.error(f"Command {command_id} failed")
                return False
        time.sleep(delay_seconds)
        attempts += 1
    radarr_logger.warning(f"Timed out waiting for command {command_id} to complete")
    return False

def get_or_create_tag(api_url: str, api_key: str, api_timeout: int, tag_label: str) -> int | None:
    """
    Get existing tag ID or create a new tag in Radarr.

    This is a thin wrapper around TagManager.get_or_create_tag().
    """
    return _tag_manager.get_or_create_tag(api_url, api_key, api_timeout, tag_label)


def add_tag_to_movie(api_url: str, api_key: str, api_timeout: int, movie_id: int, tag_id: int) -> bool:
    """
    Add a tag to a movie in Radarr.

    This is a thin wrapper around TagManager.add_tag_to_entity().
    """
    return _tag_manager.add_tag_to_entity(api_url, api_key, api_timeout, movie_id, tag_id)


def tag_processed_movie(api_url: str, api_key: str, api_timeout: int, movie_id: int, tag_label: str = "huntarr-missing") -> bool:
    """
    Tag a movie in Radarr with the specified tag.

    This is a thin wrapper around TagManager.tag_processed_entity().
    """
    return _tag_manager.tag_processed_entity(api_url, api_key, api_timeout, movie_id, tag_label)

def get_movies_with_missing_random_page(api_url: str, api_key: str, api_timeout: int, monitored_only: bool, count: int) -> list[dict] | None:
    """
    Get a random sample of missing movies by using the wanted/missing endpoint with random page selection.
    This is much more efficient than fetching all movies for very large libraries.

    Args:
        api_url: The base URL of the Radarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        monitored_only: If True, only return monitored movies
        count: Maximum number of movies to return

    Returns:
        A list of movie objects with missing files, or None if the request failed
    """
    import random

    radarr_logger.debug(f"Fetching random sample of missing movies (monitored_only={monitored_only}, count={count})...")

    # Use Radarr's wanted/missing endpoint with pagination
    endpoint = "wanted/missing"
    page_size = 100  # Smaller page size for better performance
    retries = 2
    retry_delay = 3

    # First, make a request to get just the total record count (page 1 with size=1)
    params = {
        'page': 1,
        'pageSize': 1,
        'monitored': monitored_only
    }

    for attempt in range(retries + 1):
        try:
            # Get total record count from a minimal query
            radarr_logger.debug(f"Getting missing movies count (attempt {attempt+1}/{retries+1})")
            response = arr_request(api_url, api_key, api_timeout, endpoint, params=params, count_api=False)

            if not response or not isinstance(response, dict):
                radarr_logger.warning(f"Invalid response when getting missing count (attempt {attempt+1})")
                if attempt < retries:
                    time.sleep(retry_delay)
                    continue
                return None

            total_records = response.get('totalRecords', 0)

            if total_records == 0:
                radarr_logger.info("No missing movies found in Radarr.")
                return []

            # Calculate total pages with our desired page size
            total_pages = (total_records + page_size - 1) // page_size
            radarr_logger.info(f"📊 Found {total_records} total missing movies across {total_pages} pages")

            if total_pages == 0:
                return []

            # Select a random page
            random_page = random.randint(1, total_pages)
            radarr_logger.info(f"🎲 Randomly selected page {random_page} of {total_pages} for missing movies")

            # Get movies from the random page
            params = {
                'page': random_page,
                'pageSize': page_size,
                'monitored': monitored_only
            }

            response = arr_request(api_url, api_key, api_timeout, endpoint, params=params, count_api=False)

            if not response or not isinstance(response, dict):
                radarr_logger.warning(f"Invalid response when getting missing movies page {random_page}")
                return None

            records = response.get('records', [])
            radarr_logger.info(f"📄 Retrieved {len(records)} missing movies from page {random_page}")

            # Apply monitored filter if requested (though the API should handle this)
            if monitored_only:
                filtered_records = [
                    movie for movie in records
                    if movie.get('monitored', False)
                ]
                radarr_logger.debug(f"Filtered to {len(filtered_records)} monitored missing movies")
                records = filtered_records

            # Select random movies from this page
            if len(records) > count:
                selected_records = random.sample(records, count)
                radarr_logger.info(f"🎯 Randomly selected {len(selected_records)} missing movies from page {random_page}")
                return selected_records
            else:
                # If we have fewer movies than requested, return all of them
                radarr_logger.info(f"✅ Returning all {len(records)} missing movies from page {random_page} (fewer than requested {count})")
                return records

        except Exception as e:
            radarr_logger.error(f"Error getting missing movies from Radarr (attempt {attempt+1}): {e!s}")
            if attempt < retries:
                time.sleep(retry_delay)
                continue
            return None

    # If we get here, all retries failed
    radarr_logger.error("All attempts to get missing movies failed")
    return None
