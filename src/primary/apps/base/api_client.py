#!/usr/bin/env python3
"""
Base API client for all *arr applications.

This module provides a unified API request handler that abstracts common patterns
used across Sonarr, Radarr, Lidarr, Readarr, Whisparr, and Eros APIs.

The ArrAPIClient class handles:
- HTTP request execution (GET, POST, PUT, DELETE)
- API key authentication
- Hourly rate limit checking and incrementing
- SSL verification settings
- Error handling and logging
- Response parsing
"""

import json
import logging
import sys
import traceback
from typing import Any

import requests

from src.primary.settings_manager import get_ssl_verify_setting


class ArrAPIClient:
    """
    Universal API client for *arr applications.

    This class consolidates the arr_request() function that was previously
    duplicated across 6 different app modules (~500+ lines of duplicate code).

    Attributes:
        app_name: The name of the app (sonarr, radarr, etc.) for logging and rate limiting
        api_version: The API version to use (v1 for Lidarr/Readarr, v3 for others)
        logger: Logger instance for this app
        session: Requests session for connection pooling

    Example:
        >>> client = ArrAPIClient("sonarr", api_version="v3")
        >>> status = client.request(api_url, api_key, 30, "system/status")
        >>> print(status.get('version'))
    """

    def __init__(
        self,
        app_name: str,
        api_version: str = "v3",
        logger: logging.Logger | None = None
    ):
        """
        Initialize the API client.

        Args:
            app_name: Name of the *arr app (sonarr, radarr, lidarr, readarr, whisparr, eros)
            api_version: API version string (v1 or v3)
            logger: Optional custom logger; if None, creates one based on app_name
        """
        self.app_name = app_name
        self.api_version = api_version

        if logger is None:
            from src.primary.utils.logger import get_logger
            self.logger = get_logger(app_name)
        else:
            self.logger = logger

        # Use a session for better performance (connection pooling)
        self.session = requests.Session()

    def request(
        self,
        api_url: str,
        api_key: str,
        api_timeout: int,
        endpoint: str,
        method: str = "GET",
        data: dict | None = None,
        params: dict | None = None,
        count_api: bool = True,
        check_limit_before: bool = False
    ) -> Any:
        """
        Make a request to the *arr API.

        This method consolidates the common request logic that was duplicated
        across all 6 app-specific API modules.

        Args:
            api_url: The base URL of the API (e.g., http://localhost:8989)
            api_key: The API key for authentication
            api_timeout: Timeout for the request in seconds
            endpoint: The API endpoint to call (without /api/vX/ prefix)
            method: HTTP method (GET, POST, PUT, DELETE)
            data: Optional JSON data payload for POST/PUT requests
            params: Optional query parameters for GET requests
            count_api: Whether to count this request toward the hourly API cap
            check_limit_before: Whether to check hourly limit before making request
                              (Radarr checks before, Sonarr checks after)

        Returns:
            The parsed JSON response, empty dict for empty responses, or None on failure
        """
        try:
            # Validate required parameters
            if not api_url or not api_key:
                self.logger.error("No URL or API key provided")
                return None

            # Ensure api_url has a scheme
            if not (api_url.startswith('http://') or api_url.startswith('https://')):
                self.logger.error(f"Invalid URL format: {api_url} - URL must start with http:// or https://")
                return None

            # Import stats manager for rate limiting
            from src.primary.stats_manager import check_hourly_cap_exceeded, increment_hourly_cap

            # Check hourly limit before request if configured (Radarr pattern)
            if check_limit_before and count_api and check_hourly_cap_exceeded(self.app_name):
                self.logger.warning("API hourly limit reached - skipping request")
                return None

            # Construct the full URL
            full_url = f"{api_url.rstrip('/')}/api/{self.api_version}/{endpoint.lstrip('/')}"

            # Set up headers with User-Agent to identify Huntarr
            headers = {
                "X-Api-Key": api_key,
                "Content-Type": "application/json",
                "User-Agent": "Huntarr/1.0 (https://huntarr.io)"
            }

            # Get SSL verification setting
            verify_ssl = get_ssl_verify_setting()

            if not verify_ssl:
                self.logger.debug("SSL verification disabled by user setting")

            # Execute the request based on method
            response = self._execute_request(
                method=method,
                url=full_url,
                headers=headers,
                data=data,
                params=params,
                timeout=api_timeout,
                verify_ssl=verify_ssl
            )

            if response is None:
                return None

            # Check for successful response
            response.raise_for_status()

            # Increment API counter only if count_api is True and request was successful
            if count_api:
                try:
                    increment_hourly_cap(self.app_name)
                except Exception as e:
                    self.logger.warning(f"Failed to increment API counter for {self.app_name}: {e}")

            # Parse and return the response
            return self._parse_response(response, endpoint)

        except requests.exceptions.RequestException as e:
            self._log_request_error(e, method, endpoint)
            return None
        except Exception as e:
            # Catch all exceptions and log them with traceback
            error_msg = f"CRITICAL ERROR in arr_request: {e!s}"
            self.logger.error(error_msg)
            self.logger.error(f"Full traceback: {traceback.format_exc()}")
            print(error_msg, file=sys.stderr)
            print(traceback.format_exc(), file=sys.stderr)
            return None

    def _execute_request(
        self,
        method: str,
        url: str,
        headers: dict,
        data: dict | None,
        params: dict | None,
        timeout: int,
        verify_ssl: bool
    ) -> requests.Response | None:
        """
        Execute the HTTP request based on method type.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            url: Full URL to request
            headers: Request headers
            data: JSON data for POST/PUT
            params: Query parameters for GET
            timeout: Request timeout in seconds
            verify_ssl: Whether to verify SSL certificates

        Returns:
            Response object or None if method is unsupported
        """
        method_upper = method.upper()

        if method_upper == "GET":
            return self.session.get(url, headers=headers, params=params, timeout=timeout, verify=verify_ssl)
        elif method_upper == "POST":
            return self.session.post(url, headers=headers, json=data, timeout=timeout, verify=verify_ssl)
        elif method_upper == "PUT":
            return self.session.put(url, headers=headers, json=data, timeout=timeout, verify=verify_ssl)
        elif method_upper == "DELETE":
            return self.session.delete(url, headers=headers, timeout=timeout, verify=verify_ssl)
        else:
            self.logger.error(f"Unsupported HTTP method: {method}")
            return None

    def _parse_response(self, response: requests.Response, endpoint: str) -> Any:
        """
        Parse the response content as JSON.

        Args:
            response: The HTTP response object
            endpoint: The endpoint name for error logging

        Returns:
            Parsed JSON data, empty dict for empty content, or None on parse error
        """
        if response.content:
            try:
                return response.json()
            except json.JSONDecodeError as jde:
                self.logger.error(f"Error decoding JSON response from {endpoint}: {jde!s}")
                self.logger.error(f"Response status code: {response.status_code}")
                self.logger.error(f"Response content (first 200 chars): {response.content[:200]}")
                return None
        else:
            self.logger.debug(f"Empty response content from {endpoint}, returning empty dict")
            return {}

    def _log_request_error(self, error: requests.exceptions.RequestException, method: str, endpoint: str) -> None:
        """
        Log detailed information about a request error.

        Args:
            error: The request exception
            method: HTTP method that was used
            endpoint: The endpoint that was called
        """
        error_details = str(error)
        if hasattr(error, 'response') and error.response is not None:
            error_details += f", Status Code: {error.response.status_code}"
            if error.response.content:
                error_details += f", Content: {error.response.content[:200]}"

        self.logger.error(f"Error during {method} request to {endpoint}: {error_details}")

    def check_connection(self, api_url: str, api_key: str, api_timeout: int) -> bool:
        """
        Check connection to the *arr API by fetching system status.

        Args:
            api_url: The base URL of the API
            api_key: The API key for authentication
            api_timeout: Timeout for the request

        Returns:
            True if connection is successful and returns valid status, False otherwise
        """
        if not api_url:
            self.logger.error("API URL is empty or not set")
            return False
        if not api_key:
            self.logger.error("API Key is empty or not set")
            return False

        try:
            # Use a shorter timeout for connection check
            quick_timeout = min(api_timeout, 15)
            status = self.request(api_url, api_key, quick_timeout, "system/status", count_api=False)

            if status and isinstance(status, dict) and 'version' in status:
                self.logger.debug(f"Connection check successful for {api_url}. Version: {status.get('version')}")
                return True
            else:
                self.logger.warning(f"Connection check for {api_url} returned unexpected status: {str(status)[:200]}")
                return False
        except Exception as e:
            self.logger.error(f"Connection check failed for {api_url}: {e}")
            return False

    def get_system_status(self, api_url: str, api_key: str, api_timeout: int) -> dict:
        """
        Get system status from the *arr API.

        Args:
            api_url: The base URL of the API
            api_key: The API key for authentication
            api_timeout: Timeout for the request

        Returns:
            System status dict or empty dict on failure
        """
        response = self.request(api_url, api_key, api_timeout, "system/status", count_api=False)
        return response if response else {}

    def get_download_queue_size(self, api_url: str, api_key: str, api_timeout: int) -> int:
        """
        Get the current size of the download queue.

        Args:
            api_url: The base URL of the API
            api_key: The API key for authentication
            api_timeout: Timeout for the request

        Returns:
            Queue size as integer, or -1 on error
        """
        try:
            params = {'page': 1, 'pageSize': 1}
            response = self.request(api_url, api_key, api_timeout, "queue", params=params, count_api=False)

            if response and isinstance(response, dict):
                queue_size = response.get('totalRecords', 0)
                self.logger.debug(f"{self.app_name.title()} download queue size: {queue_size}")
                return queue_size
            return -1
        except Exception as e:
            self.logger.error(f"Error getting download queue size: {e}")
            return -1

    def get_quality_profiles(self, api_url: str, api_key: str, api_timeout: int) -> list | None:
        """
        Get all quality profiles configured in the *arr application.

        Args:
            api_url: The base URL of the API
            api_key: The API key for authentication
            api_timeout: Timeout for the request

        Returns:
            List of quality profile dicts, or None on failure
        """
        try:
            self.logger.debug(f"Fetching quality profiles from {self.app_name.title()}...")

            profiles = self.request(api_url, api_key, api_timeout, "qualityProfile", count_api=False)

            if profiles is None:
                self.logger.error(f"Failed to retrieve quality profiles from {self.app_name.title()} API.")
                return None

            self.logger.debug(f"Found {len(profiles)} quality profiles in {self.app_name.title()}")

            # Log profile names for debugging
            profile_names = [profile.get('name', 'Unknown') for profile in profiles]
            self.logger.debug(f"Quality profiles: {', '.join(profile_names)}")

            return profiles

        except Exception as e:
            self.logger.error(f"Error retrieving quality profiles: {e!s}")
            return None


# Convenience function for backward compatibility
def create_arr_client(app_name: str, api_version: str = "v3") -> ArrAPIClient:
    """
    Factory function to create an ArrAPIClient instance.

    Args:
        app_name: Name of the *arr application
        api_version: API version (v1 or v3)

    Returns:
        Configured ArrAPIClient instance
    """
    return ArrAPIClient(app_name=app_name, api_version=api_version)
