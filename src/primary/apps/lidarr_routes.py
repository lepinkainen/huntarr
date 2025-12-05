#!/usr/bin/env python3

from flask import Blueprint, request, jsonify
import datetime, os, requests

from src.primary.state import reset_state_file, check_state_reset
from src.primary.utils.logger import get_logger
from src.primary.apps.base.routes import test_connection_handler
import traceback
from src.primary.apps.lidarr import missing, upgrade
from src.primary.auth import get_app_url_and_key
from src.primary import settings_manager
import logging

logger = logging.getLogger(__name__)

lidarr_bp = Blueprint('lidarr', __name__)
lidarr_logger = get_logger("lidarr")

# State management now handled directly through database calls

@lidarr_bp.route('/missing', methods=['POST'])
def lidarr_missing():
    """Handle Lidarr missing albums search"""
    try:
        # Check if state needs to be reset
        check_state_reset("lidarr")

        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("lidarr")
        if not app_url or not api_key:
            return jsonify({"error": "Lidarr not configured"}), 400

        # Get settings from database
        missing_search_enabled = settings_manager.get_app_setting("lidarr", "missing_search", True)
        if not missing_search_enabled:
            return jsonify({"message": "Missing search is disabled for Lidarr"}), 200

        # Run missing search
        result = missing.run_missing_search(app_url, api_key, "lidarr")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error in Lidarr missing search: {e}")
        return jsonify({"error": str(e)}), 500

@lidarr_bp.route('/upgrade', methods=['POST'])
def lidarr_upgrade():
    """Handle Lidarr upgrade search"""
    try:
        # Check if state needs to be reset
        check_state_reset("lidarr")

        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("lidarr")
        if not app_url or not api_key:
            return jsonify({"error": "Lidarr not configured"}), 400

        # Get settings from database
        upgrade_search_enabled = settings_manager.get_app_setting("lidarr", "upgrade_search", True)
        if not upgrade_search_enabled:
            return jsonify({"message": "Upgrade search is disabled for Lidarr"}), 200

        # Run upgrade search
        result = upgrade.run_upgrade_search(app_url, api_key, "lidarr")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error in Lidarr upgrade search: {e}")
        return jsonify({"error": str(e)}), 500

@lidarr_bp.route('/reset', methods=['POST'])
def lidarr_reset():
    """Reset Lidarr state files"""
    try:
        data = request.get_json() or {}
        reset_type = data.get('type', 'all')

        success = True
        if reset_type == 'missing' or reset_type == 'all':
            success &= reset_state_file("lidarr", "processed_missing")
        if reset_type == 'upgrade' or reset_type == 'all':
            success &= reset_state_file("lidarr", "processed_upgrades")

        if success:
            return jsonify({"message": f"Lidarr {reset_type} state reset successfully"})
        else:
            return jsonify({"error": f"Failed to reset Lidarr {reset_type} state"}), 500

    except Exception as e:
        logger.error(f"Error resetting Lidarr state: {e}")
        return jsonify({"error": str(e)}), 500

@lidarr_bp.route('/test-connection', methods=['POST'])
def test_connection():
    """Test connection to a Lidarr API instance - delegates to shared handler"""
    return test_connection_handler("lidarr", "v1", lidarr_logger)


