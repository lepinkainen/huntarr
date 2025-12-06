#!/usr/bin/env python3

import logging

from flask import Blueprint, jsonify, request

from src.primary import settings_manager
from src.primary.apps.base.routes import test_connection_handler
from src.primary.apps.readarr import missing, upgrade
from src.primary.auth import get_app_url_and_key
from src.primary.state import check_state_reset, reset_state_file
from src.primary.utils.logger import get_logger

logger = logging.getLogger(__name__)

readarr_bp = Blueprint('readarr', __name__)
readarr_logger = get_logger("readarr")

# State management now handled directly through database calls

@readarr_bp.route('/missing', methods=['POST'])
def readarr_missing():
    """Handle Readarr missing books search"""
    try:
        # Check if state needs to be reset
        check_state_reset("readarr")

        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("readarr")
        if not app_url or not api_key:
            return jsonify({"error": "Readarr not configured"}), 400

        # Get settings from database
        missing_search_enabled = settings_manager.get_app_setting("readarr", "missing_search", True)
        if not missing_search_enabled:
            return jsonify({"message": "Missing search is disabled for Readarr"}), 200

        # Run missing search
        result = missing.run_missing_search(app_url, api_key, "readarr")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error in Readarr missing search: {e}")
        return jsonify({"error": str(e)}), 500

@readarr_bp.route('/upgrade', methods=['POST'])
def readarr_upgrade():
    """Handle Readarr upgrade search"""
    try:
        # Check if state needs to be reset
        check_state_reset("readarr")

        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("readarr")
        if not app_url or not api_key:
            return jsonify({"error": "Readarr not configured"}), 400

        # Get settings from database
        upgrade_search_enabled = settings_manager.get_app_setting("readarr", "upgrade_search", True)
        if not upgrade_search_enabled:
            return jsonify({"message": "Upgrade search is disabled for Readarr"}), 200

        # Run upgrade search
        result = upgrade.run_upgrade_search(app_url, api_key, "readarr")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error in Readarr upgrade search: {e}")
        return jsonify({"error": str(e)}), 500

@readarr_bp.route('/reset', methods=['POST'])
def readarr_reset():
    """Reset Readarr state files"""
    try:
        data = request.get_json() or {}
        reset_type = data.get('type', 'all')

        success = True
        if reset_type == 'missing' or reset_type == 'all':
            success &= reset_state_file("readarr", "processed_missing")
        if reset_type == 'upgrade' or reset_type == 'all':
            success &= reset_state_file("readarr", "processed_upgrades")

        if success:
            return jsonify({"message": f"Readarr {reset_type} state reset successfully"})
        else:
            return jsonify({"error": f"Failed to reset Readarr {reset_type} state"}), 500

    except Exception as e:
        logger.error(f"Error resetting Readarr state: {e}")
        return jsonify({"error": str(e)}), 500

@readarr_bp.route('/test-connection', methods=['POST'])
def test_connection():
    """Test connection to a Readarr API instance - delegates to shared handler"""
    return test_connection_handler("readarr", "v1", readarr_logger)


