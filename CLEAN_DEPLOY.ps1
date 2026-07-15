# Retired local production entrypoint.
# Production changes are authorized only by the protected exact-SHA workflow.
Write-Error "Refusing ungated production deployment. Use .github/workflows/firebase-production-deploy.yml."
exit 1
