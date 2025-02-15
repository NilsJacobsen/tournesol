"""
API endpoint to interact with the contributor's ratings.
"""
from django.db.models import Func, OuterRef, Q, Subquery
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from tournesol.models import (
    Comparison,
    ContributorRating,
    ContributorRatingCriteriaScore,
    EntityPollRating,
    Poll,
)
from tournesol.serializers.rating import (
    ContributorRatingCreateSerializer,
    ContributorRatingSerializer,
    ContributorRatingUpdateAllSerializer,
)
from tournesol.views.mixins.poll import PollScopedViewMixin

# The only values accepted by the URL parameter `order_by` in the list APIs.
ALLOWED_GENERIC_ORDER_BY_VALUES = [
    "last_compared_at",
    "-last_compared_at",
    "n_comparisons",
    "-n_comparisons",
    "collective_score",
    "-collective_score",
    "individual_score",
    "-individual_score",
]

# Appended to the positional arguments of all calls to QuerySet.order_by()
EXTRA_ORDER_BY = "-pk"

DEFAULT_ORDER_BY = ["-last_compared_at", EXTRA_ORDER_BY]


def get_annotated_ratings(poll: Poll):
    """
    Return a `ContributorRating` queryset with additional annotations like:
        - the number of comparisons made by the user for the entity
        - the date of the last comparison made for this entity
        - etc.

    This queryset expects to be evaluated with a specific poll, user and
    entity.
    """
    n_comparisons = (
        Comparison.objects.filter(poll=OuterRef("poll"), user=OuterRef("user"))
        .filter(Q(entity_1=OuterRef("entity")) | Q(entity_2=OuterRef("entity")))
        .annotate(count=Func("id", function="Count"))
        .values("count")
    )

    last_compared_at = (
        Comparison.objects.filter(poll=OuterRef("poll"), user=OuterRef("user"))
        .filter(Q(entity_1=OuterRef("entity")) | Q(entity_2=OuterRef("entity")))
        .values("datetime_lastedit")
        .order_by("-datetime_lastedit")
    )[:1]

    collective_score = (
        EntityPollRating.objects.filter(poll=OuterRef("poll"), entity=OuterRef("entity"))
        .values("tournesol_score")
    )

    individual_score = (
        ContributorRatingCriteriaScore.objects
        .filter(contributor_rating=OuterRef("pk"), criteria=poll.main_criteria)
        .values("score")
    )

    return ContributorRating.objects.annotate(
        n_comparisons=Subquery(n_comparisons),
        last_compared_at=Subquery(last_compared_at),
        collective_score=Subquery(collective_score),
        individual_score=Subquery(individual_score)
    )


@extend_schema_view(
    get=extend_schema(
        description="Retrieve the logged-in user's ratings for a specific entity "
        "(computed automatically from the user's comparisons)."
    ),
    put=extend_schema(
        description="Update public / private status of the logged-in user ratings "
        "for a specific entity."
    ),
    patch=extend_schema(
        description="Update public / private status of the logged-in user ratings "
        "for a specific entity."
    ),
)
class ContributorRatingDetail(PollScopedViewMixin, generics.RetrieveUpdateAPIView):
    """
    Get or update the current user's rating for the designated entity.
    Used in particular to get or update the is_public attribute.
    """

    serializer_class = ContributorRatingSerializer

    def get_object(self):
        return get_object_or_404(
            get_annotated_ratings(self.poll_from_url),
            poll=self.poll_from_url,
            user=self.request.user,
            entity__uid=self.kwargs["uid"],
        )


@extend_schema_view(
    get=extend_schema(
        description="Retrieve the logged-in user's ratings per entity in a given poll"
        " (computed automatically from the user's comparisons).",
        parameters=[
            OpenApiParameter(
                "is_public",
                type=OpenApiTypes.BOOL,
                location=OpenApiParameter.QUERY,
                description="Filter public or private ratings.",
            ),
            OpenApiParameter(
                "order_by",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description="Order the results by: "
                + ", ".join(ALLOWED_GENERIC_ORDER_BY_VALUES)
                + ", or any allowed metadata field.",
            ),
        ],
    ),
    post=extend_schema(
        description="Initialize the rating object for the current user about a "
        "specific video in a given poll, with optional visibility settings."
    ),
)
class ContributorRatingList(PollScopedViewMixin, generics.ListCreateAPIView):
    """List the contributor's rated entities on the given poll and their scores."""

    queryset = ContributorRating.objects.none()

    def _filter_queryset_by_visibility(self, qst):
        is_public = self.request.query_params.get("is_public")
        if is_public:
            if is_public == "true":
                qst = qst.filter(is_public=True)
            elif is_public == "false":
                qst = qst.filter(is_public=False)
            else:
                raise ValidationError(
                    "The URL parameter 'is_public' must be 'true' or 'false'"
                )

        return qst

    def _order_queryset(self, poll: Poll, qst):
        """
        Return an ordered queryset based on the `order_by` URL parameter. Raise
        `ValidationError` if the `order_by` value is not accepted by this view.

        If not order is specified, the default order is used.
        """
        order_by = self.request.query_params.get("order_by")

        if not order_by:
            return qst.order_by(*DEFAULT_ORDER_BY)

        if order_by in ALLOWED_GENERIC_ORDER_BY_VALUES:
            return qst.order_by(order_by, EXTRA_ORDER_BY)

        sign = "-" if order_by[0] == "-" else ""
        field = order_by[1:] if order_by[0] == "-" else order_by

        if field in poll.entity_cls.get_allowed_meta_order_fields():
            return qst.order_by(f"{sign}entity__metadata__{field}", EXTRA_ORDER_BY)

        raise ValidationError("The URL parameter 'order_by' is invalid.")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ContributorRatingCreateSerializer
        return ContributorRatingSerializer

    def get_queryset(self):
        ratings = (
            get_annotated_ratings(self.poll_from_url)
            .filter(
                poll=self.poll_from_url, user=self.request.user, n_comparisons__gt=0
            )
            .select_related("entity")
            .prefetch_related("criteria_scores")
        )

        ratings = self._filter_queryset_by_visibility(ratings)
        ratings = self._order_queryset(self.poll_from_url, ratings)
        return ratings


class ContributorRatingUpdateAll(PollScopedViewMixin, generics.GenericAPIView):
    """
    Mark all contributor ratings by current user as public or private in the
    given poll.
    """

    serializer_class = ContributorRatingUpdateAllSerializer

    def get_queryset(self):
        return ContributorRating.objects.filter(
            poll=self.poll_from_url, user=self.request.user
        )

    def patch(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        queryset.update(is_public=serializer.validated_data["is_public"])
        return Response(serializer.data)
