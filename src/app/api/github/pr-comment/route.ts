/**
 * GitHub PR Comment API
 *
 * POST /api/github/pr-comment - Post a comment or review on a GitHub PR
 */

import { NextRequest, NextResponse } from "next/server";
import { postPRComment, postPRReview, getPRFiles, getPRDetails } from "@/core/github";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, repo, prNumber, comment, review, action } = body;

    if (!token || !repo || !prNumber) {
      return NextResponse.json(
        { error: "Missing required fields: token, repo, prNumber" },
        { status: 400 }
      );
    }

    // Action: get-files - Get PR files for review
    if (action === "get-files") {
      const files = await getPRFiles({ token, repo, prNumber });
      return NextResponse.json({ files });
    }

    // Action: get-details - Get PR details
    if (action === "get-details") {
      const details = await getPRDetails({ token, repo, prNumber });
      return NextResponse.json({ details });
    }

    // Action: post-comment - Post a simple comment
    if (action === "post-comment" || comment) {
      if (!comment) {
        return NextResponse.json(
          { error: "Missing required field: comment" },
          { status: 400 }
        );
      }

      const result = await postPRComment({
        token,
        repo,
        prNumber,
        body: comment,
      });

      return NextResponse.json({
        success: true,
        commentId: result.id,
        url: result.html_url,
      });
    }

    // Action: post-review - Post a review (APPROVE, REQUEST_CHANGES, COMMENT)
    if (action === "post-review" || review) {
      if (!review || !review.body || !review.event) {
        return NextResponse.json(
          { error: "Missing required fields: review.body, review.event" },
          { status: 400 }
        );
      }

      if (!["APPROVE", "REQUEST_CHANGES", "COMMENT"].includes(review.event)) {
        return NextResponse.json(
          { error: "Invalid review.event. Must be: APPROVE, REQUEST_CHANGES, or COMMENT" },
          { status: 400 }
        );
      }

      const result = await postPRReview({
        token,
        repo,
        prNumber,
        body: review.body,
        event: review.event,
        commitId: review.commitId,
      });

      return NextResponse.json({
        success: true,
        reviewId: result.id,
        url: result.html_url,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Must be: get-files, get-details, post-comment, or post-review" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[GitHubPRCommentAPI] POST error:", error);
    return NextResponse.json(
      { error: "Failed to process PR comment request", details: String(error) },
      { status: 500 }
    );
  }
}

