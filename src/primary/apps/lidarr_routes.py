#!/usr/bin/env python3

from flask import Blueprint, request, jsonify
import datetime, os, requests

from src.primary.state import reset_state_file
from src.primary.utils.logger import get_logger
from src.primary.apps.base.routes import test_connection_handler
import traceback

lidarr_bp = Blueprint('lidarr', __name__)
lidarr_logger = get_logger("lidarr")

# State management now handled directly through database calls

@lidarr_bp.route('/test-connection', methods=['POST'])
def test_connection():
    """Test connection to a Lidarr API instance - delegates to shared handler"""
    return test_connection_handler("lidarr", "v1", lidarr_logger)


