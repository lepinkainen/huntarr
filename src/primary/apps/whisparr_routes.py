#!/usr/bin/env python3

import logging
import os
import traceback

import requests
from flask import Blueprint, jsonify, request

from src.primary import settings_manager
from src.primary.apps.base.routes import whisparr_test_connection_handler
from src.primary.apps.whisparr import api as whisparr_api
from src.primary.apps.whisparr import missing, upgrade
from src.primary.auth import get_app_url_and_key
from src.primary.state import check_state_reset, reset_state_file
from src.primary.utils.logger import APP_LOG_FILES, get_logger

logger = logging.getLogger(__name__)

whisparr_bp = Blueprint('whisparr', __name__)
whisparr_logger = get_logger("whisparr")

# State management now handled directly through database calls

@whisparr_bp.route('/missing', methods=['POST'])
def whisparr_missing():
    """Handle Whisparr missing items search"""
    try:
        # Check if state needs to be reset
        check_state_reset("whisparr")

        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("whisparr")
        if not app_url or not api_key:
            return jsonify({"error": "Whisparr not configured"}), 400

        # Get settings from database
        missing_search_enabled = settings_manager.get_app_setting("whisparr", "missing_search", True)
        if not missing_search_enabled:
            return jsonify({"message": "Missing search is disabled for Whisparr"}), 200

        # Run missing search
        result = missing.run_missing_search(app_url, api_key, "whisparr")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error in Whisparr missing search: {e}")
        return jsonify({"error": str(e)}), 500

@whisparr_bp.route('/upgrade', methods=['POST'])
def whisparr_upgrade():
    """Handle Whisparr upgrade search"""
    try:
        # Check if state needs to be reset
        check_state_reset("whisparr")

        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("whisparr")
        if not app_url or not api_key:
            return jsonify({"error": "Whisparr not configured"}), 400

        # Get settings from database
        upgrade_search_enabled = settings_manager.get_app_setting("whisparr", "upgrade_search", True)
        if not upgrade_search_enabled:
            return jsonify({"message": "Upgrade search is disabled for Whisparr"}), 200

        # Run upgrade search
        result = upgrade.run_upgrade_search(app_url, api_key, "whisparr")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error in Whisparr upgrade search: {e}")
        return jsonify({"error": str(e)}), 500

@whisparr_bp.route('/reset', methods=['POST'])
def whisparr_reset():
    """Reset Whisparr state files"""
    try:
        data = request.get_json() or {}
        reset_type = data.get('type', 'all')

        success = True
        if reset_type == 'missing' or reset_type == 'all':
            success &= reset_state_file("whisparr", "processed_missing")
        if reset_type == 'upgrade' or reset_type == 'all':
            success &= reset_state_file("whisparr", "processed_upgrades")

        if success:
            return jsonify({"message": f"Whisparr {reset_type} state reset successfully"})
        else:
            return jsonify({"error": f"Failed to reset Whisparr {reset_type} state"}), 500

    except Exception as e:
        logger.error(f"Error resetting Whisparr state: {e}")
        return jsonify({"error": str(e)}), 500

@whisparr_bp.route('/status', methods=['GET'])
def get_status():
    """Get the status of configured Whisparr instance"""
    try:
        # Get configured instance
        from src.primary.settings_manager import load_settings
        settings = load_settings("whisparr")

        api_url = settings.get("url", "")
        api_key = settings.get("api_key", "")
        enabled = settings.get("enabled", True)

        connected_count = 0
        total_configured = 1 if api_url and api_key else 0

        if api_url and api_key and enabled:
            # Use a short timeout for status checks
            if whisparr_api.check_connection(api_url, api_key, 5):
                connected_count = 1

        return jsonify({
            "configured": total_configured > 0,
            "connected": connected_count > 0,
            "connected_count": connected_count,
            "total_configured": total_configured
        })
    except Exception as e:
        whisparr_logger.error(f"Error getting Whisparr status: {e!s}")
        return jsonify({
            "configured": False,
            "connected": False,
            "error": str(e)
        }), 500

@whisparr_bp.route('/test-connection', methods=['POST'])
def test_connection():
    """Test connection to a Whisparr API instance - delegates to shared handler"""
    return whisparr_test_connection_handler(whisparr_logger)

# Function to check if Whisparr is configured
def is_configured():
    """Check if Whisparr API credentials are configured"""
    from src.primary.settings_manager import load_settings
    settings = load_settings("whisparr")
    return settings.get("url") and settings.get("api_key")

@whisparr_bp.route('/versions', methods=['GET'])
def get_versions():
    """Get the version information from the Whisparr API"""
    try:
        # Get configured instance
        from src.primary.settings_manager import load_settings
        settings = load_settings("whisparr")

        api_url = settings.get("url", "")
        api_key = settings.get("api_key", "")
        enabled = settings.get("enabled", True)
        instance_name = settings.get("name", "Default")

        if not api_url or not api_key:
            return jsonify({"success": False, "message": "No Whisparr instance configured"}), 404

        if not enabled:
            return jsonify({"success": False, "message": "Whisparr instance is disabled"}), 404

        # First try standard API endpoint
        version_url = f"{api_url.rstrip('/')}/api/system/status"
        headers = {"X-Api-Key": api_key}

        try:
            response = requests.get(version_url, headers=headers, timeout=10)

            # If we get a 404, try with the v3 path
            if response.status_code == 404:
                whisparr_logger.debug(f"Standard API path failed for {instance_name}, trying v3 path")
                v3_url = f"{api_url.rstrip('/')}/api/v3/system/status"
                response = requests.get(v3_url, headers=headers, timeout=10)

            if response.status_code == 200:
                version_data = response.json()
                version = version_data.get("version", "Unknown")

                # Validate that it's a V2 version
                if version and version.startswith('2'):
                    result = {
                        "name": instance_name,
                        "success": True,
                        "version": version,
                        "is_v2": True
                    }
                elif version and version.startswith('3'):
                    # Reject Eros API version
                    result = {
                        "name": instance_name,
                        "success": False,
                        "message": f"Incompatible Whisparr version {version} detected. Huntarr requires Whisparr V2.",
                        "version": version
                    }
                else:
                    # Unexpected version
                    result = {
                        "name": instance_name,
                        "success": False,
                        "message": f"Unexpected Whisparr version {version} detected. Huntarr requires Whisparr V2.",
                        "version": version
                    }
            else:
                # API call failed
                result = {
                    "name": instance_name,
                    "success": False,
                    "message": f"Failed to get version information: HTTP {response.status_code}"
                }
        except requests.exceptions.RequestException as e:
            result = {
                "name": instance_name,
                "success": False,
                "message": f"Connection error: {e!s}"
            }

        return jsonify({"success": True, "results": [result]})
    except Exception as e:
        whisparr_logger.error(f"Error getting Whisparr versions: {e!s}")
        return jsonify({"success": False, "message": str(e)}), 500

@whisparr_bp.route('/logs', methods=['GET'])
def get_logs():
    """Get the log file for Whisparr"""
    try:
        # Get the log file path
        log_file = APP_LOG_FILES.get("whisparr")

        if not log_file or not os.path.exists(log_file):
            return jsonify({"success": False, "message": "Log file not found"}), 404

        # Read the log file (last 200 lines)
        with open(log_file) as f:
            lines = f.readlines()
            log_content = ''.join(lines[-200:])

        return jsonify({"success": True, "logs": log_content})
    except Exception as e:
        error_message = f"Error fetching Whisparr logs: {e!s}"
        whisparr_logger.error(error_message)
        traceback.print_exc()
        return jsonify({"success": False, "message": error_message}), 500

@whisparr_bp.route('/clear-processed', methods=['POST'])
def clear_processed():
    """Clear the processed missing and upgrade files for Whisparr"""
    try:
        # Reset missing items state file
        whisparr_logger.info("Clearing processed missing items state")
        reset_state_file("whisparr", "processed_missing")

        # Reset upgrade state file
        whisparr_logger.info("Clearing processed quality upgrade state")
        reset_state_file("whisparr", "processed_upgrades")

        return jsonify({
            "success": True,
            "message": "Successfully cleared Whisparr processed state"
        })
    except Exception as e:
        error_message = f"Error clearing Whisparr processed state: {e!s}"
        whisparr_logger.error(error_message)
        return jsonify({"success": False, "message": error_message}), 500

