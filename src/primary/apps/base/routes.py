#!/usr/bin/env python3
"""
Shared route handlers for *arr applications.
Provides factory functions to create test_connection handlers with app-specific configuration.
"""

import socket
import requests
from urllib.parse import urlparse
from flask import jsonify, request
from src.primary.settings_manager import get_ssl_verify_setting


def test_connection_handler(app_name: str, api_version: str, logger, version_validator=None):
    """
    Generic test_connection handler that works for all *arr apps.

    Args:
        app_name: Name of the app (e.g., "sonarr", "radarr")
        api_version: API version to use (e.g., "v3", "v1")
        logger: Logger instance for the app
        version_validator: Optional function to validate version response.
                          Should return (success, response_dict, status_code) tuple.
                          If None, standard validation is used.

    Returns:
        Flask JSON response
    """
    data = request.json
    api_url = data.get('api_url')
    api_key = data.get('api_key')
    api_timeout = data.get('api_timeout', 30)

    if not api_url or not api_key:
        return jsonify({"success": False, "message": "API URL and API Key are required"}), 400

    # Auto-correct URL if missing http(s) scheme
    if not (api_url.startswith('http://') or api_url.startswith('https://')):
        logger.debug(f"Auto-correcting URL to add http:// scheme")
        api_url = f"http://{api_url}"

    # Try socket connection for quick feedback on connectivity issues
    parsed_url = urlparse(api_url)
    hostname = parsed_url.hostname
    port = parsed_url.port or (443 if parsed_url.scheme == 'https' else 80)

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        result = sock.connect_ex((hostname, port))
        sock.close()

        if result != 0:
            error_msg = f"Connection refused - Unable to connect to {hostname}:{port}. Please check if the server is running and the port is correct."
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), 404
    except socket.gaierror:
        error_msg = f"DNS resolution failed - Cannot resolve hostname: {hostname}. Please check your URL."
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 404
    except Exception as e:
        logger.debug(f"Socket test error, continuing with full request: {str(e)}")

    # Build API URL
    test_url = f"{api_url.rstrip('/')}/api/{api_version}/system/status"
    headers = {'X-Api-Key': api_key}

    # Get SSL verification setting
    verify_ssl = get_ssl_verify_setting()
    if not verify_ssl:
        logger.debug("SSL verification disabled by user setting for connection test")

    try:
        response = requests.get(test_url, headers=headers, timeout=(10, api_timeout), verify=verify_ssl)

        # Handle HTTP errors
        if response.status_code == 401:
            error_msg = "Authentication failed: Invalid API key"
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), 401
        elif response.status_code == 403:
            error_msg = "Access forbidden: Check API key permissions"
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), 403
        elif response.status_code == 404:
            error_msg = f"API endpoint not found: This doesn't appear to be a valid {app_name.title()} server. Check your URL."
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), 404
        elif response.status_code >= 500:
            error_msg = f"{app_name.title()} server error (HTTP {response.status_code}): The server is experiencing issues"
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), response.status_code

        response.raise_for_status()
        logger.debug(f"{app_name.title()} API status code: {response.status_code}")

        # Parse JSON response
        try:
            response_data = response.json()
            version = response_data.get('version', 'unknown')

            # Use custom validator if provided
            if version_validator:
                return version_validator(response_data, version, logger)

            # Standard success response
            return jsonify({
                "success": True,
                "message": f"Successfully connected to {app_name.title()} API",
                "version": version
            })
        except ValueError:
            error_msg = f"Invalid JSON response from {app_name.title()} API - This doesn't appear to be a valid server"
            logger.error(f"{error_msg}. Response content: {response.text[:200]}")
            return jsonify({"success": False, "message": error_msg}), 500

    except requests.exceptions.Timeout:
        error_msg = f"Connection timed out after {api_timeout} seconds"
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 504

    except requests.exceptions.ConnectionError as e:
        error_details = str(e)
        if "Connection refused" in error_details:
            error_msg = f"Connection refused - {app_name.title()} is not running on {api_url} or the port is incorrect"
        elif "Name or service not known" in error_details or "getaddrinfo failed" in error_details:
            error_msg = f"DNS resolution failed - Cannot find host '{hostname}'. Check your URL."
        else:
            error_msg = f"Connection error - Check if {app_name.title()} is running: {error_details}"
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 404

    except requests.exceptions.RequestException as e:
        error_msg = f"Connection test failed: {str(e)}"
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 500


def whisparr_test_connection_handler(logger):
    """
    Whisparr-specific test_connection handler with dual version support (v2/v3 detection).
    Accepts v2, rejects v3 (Eros).
    """
    data = request.json
    api_url = data.get('api_url')
    api_key = data.get('api_key')
    api_timeout = data.get('api_timeout', 30)

    if not api_url or not api_key:
        return jsonify({"success": False, "message": "API URL and API Key are required"}), 400

    # Auto-correct URL
    if not (api_url.startswith('http://') or api_url.startswith('https://')):
        logger.debug(f"Auto-correcting URL to add http:// scheme")
        api_url = f"http://{api_url}"

    # Socket test
    parsed_url = urlparse(api_url)
    hostname = parsed_url.hostname
    port = parsed_url.port or (443 if parsed_url.scheme == 'https' else 80)

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        result = sock.connect_ex((hostname, port))
        sock.close()

        if result != 0:
            error_msg = f"Connection refused - Unable to connect to {hostname}:{port}."
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), 404
    except socket.gaierror:
        error_msg = f"DNS resolution failed - Cannot resolve hostname: {hostname}."
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 404
    except Exception as e:
        logger.debug(f"Socket test error, continuing: {str(e)}")

    # Try both v2 and v3 API paths
    api_paths = [
        {"url": f"{api_url.rstrip('/')}/api/system/status", "version": "v2"},
        {"url": f"{api_url.rstrip('/')}/api/v3/system/status", "version": "v3"}
    ]

    headers = {"X-Api-Key": api_key, "Content-Type": "application/json"}
    verify_ssl = get_ssl_verify_setting()

    response = None
    detected_version = None

    for api_path in api_paths:
        try:
            url = api_path["url"]
            logger.debug(f"Trying API path: {url}")
            response = requests.get(url, headers=headers, timeout=(10, api_timeout), verify=verify_ssl)

            if response.status_code == 200:
                detected_version = api_path["version"]
                break
        except requests.exceptions.RequestException:
            continue

    if not response or response.status_code != 200:
        if response:
            if response.status_code == 401:
                return jsonify({"success": False, "message": "Authentication failed: Invalid API key"}), 401
            elif response.status_code == 403:
                return jsonify({"success": False, "message": "Access forbidden: Check API key permissions"}), 403
            elif response.status_code == 404:
                return jsonify({"success": False, "message": "API endpoint not found: Not a valid Whisparr server."}), 404
            elif response.status_code >= 500:
                return jsonify({"success": False, "message": f"Server error (HTTP {response.status_code})"}), response.status_code
            else:
                return jsonify({"success": False, "message": f"HTTP error {response.status_code}"}), response.status_code
        return jsonify({"success": False, "message": "Could not connect to any Whisparr API endpoint"}), 404

    try:
        response_data = response.json()
        version = response_data.get('version', 'unknown')

        if version and version.startswith('2'):
            return jsonify({
                "success": True,
                "message": "Successfully connected to Whisparr API",
                "version": version,
                "is_v2": True
            })
        elif version and version.startswith('3'):
            error_msg = f"Incompatible Whisparr version {version} detected. Huntarr requires Whisparr V2."
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), 400
        else:
            error_msg = f"Unexpected Whisparr version {version} detected. Huntarr requires Whisparr V2."
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), 400
    except ValueError:
        error_msg = "Invalid JSON response from Whisparr API"
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 500
    except requests.exceptions.RequestException as e:
        error_msg = f"Connection test failed: {str(e)}"
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 500


def eros_test_connection_handler(logger):
    """
    Eros-specific test_connection handler.
    Only accepts v3 API (Eros), rejects v2 (Whisparr).
    """
    data = request.json
    api_url = data.get('api_url')
    api_key = data.get('api_key')
    api_timeout = data.get('api_timeout', 30)

    if not api_url or not api_key:
        return jsonify({"success": False, "message": "API URL and API Key are required"}), 400

    # Auto-correct URL
    if not (api_url.startswith('http://') or api_url.startswith('https://')):
        logger.debug(f"Auto-correcting URL to add http:// scheme")
        api_url = f"http://{api_url}"

    # Socket test
    parsed_url = urlparse(api_url)
    hostname = parsed_url.hostname
    port = parsed_url.port or (443 if parsed_url.scheme == 'https' else 80)

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        result = sock.connect_ex((hostname, port))
        sock.close()

        if result != 0:
            error_msg = f"Connection refused - Unable to connect to {hostname}:{port}."
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), 404
    except socket.gaierror:
        error_msg = f"DNS resolution failed - Cannot resolve hostname: {hostname}."
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 404
    except Exception as e:
        logger.debug(f"Socket test error, continuing: {str(e)}")

    # Eros uses v3 API only
    test_url = f"{api_url.rstrip('/')}/api/v3/system/status"
    headers = {"X-Api-Key": api_key, "Content-Type": "application/json"}
    verify_ssl = get_ssl_verify_setting()

    try:
        response = requests.get(test_url, headers=headers, timeout=(5, 30), verify=verify_ssl)

        if response.status_code == 401:
            return jsonify({"success": False, "message": "Authentication failed: Invalid API key"}), 401
        elif response.status_code == 403:
            return jsonify({"success": False, "message": "Access forbidden: Check API key permissions"}), 403
        elif response.status_code == 404:
            return jsonify({"success": False, "message": "API endpoint not found: Not a valid Eros server."}), 404
        elif response.status_code >= 500:
            return jsonify({"success": False, "message": f"Server error (HTTP {response.status_code})"}), response.status_code

        response.raise_for_status()

        response_data = response.json()
        version = response_data.get('version', 'unknown')

        # Eros requires v3
        if version and version.startswith('3'):
            return jsonify({
                "success": True,
                "message": "Successfully connected to Eros API",
                "version": version,
                "api_version": "v3"
            })
        elif version and version.startswith('2'):
            error_msg = f"Detected Whisparr V2 (version {version}). Eros requires V3 API."
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), 400
        else:
            error_msg = f"Unexpected version {version} detected. Eros requires V3 API."
            logger.error(error_msg)
            return jsonify({"success": False, "message": error_msg}), 400

    except ValueError:
        error_msg = "Invalid JSON response from Eros API"
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 500
    except requests.exceptions.Timeout:
        error_msg = "Connection timed out"
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 504
    except requests.exceptions.ConnectionError as e:
        error_msg = f"Connection error: {str(e)}"
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 404
    except requests.exceptions.RequestException as e:
        error_msg = f"Connection test failed: {str(e)}"
        logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 500
