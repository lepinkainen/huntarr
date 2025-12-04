#!/usr/bin/env python3

from flask import Blueprint, request, jsonify
import datetime, os, requests

from src.primary.state import reset_state_file
from src.primary.utils.logger import get_logger
from src.primary.apps.base.routes import test_connection_handler
import traceback

readarr_bp = Blueprint('readarr', __name__)
readarr_logger = get_logger("readarr")

# State management now handled directly through database calls

@readarr_bp.route('/test-connection', methods=['POST'])
def test_connection():
    """Test connection to a Readarr API instance - delegates to shared handler"""
    return test_connection_handler("readarr", "v1", readarr_logger)


