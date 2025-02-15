import factory
from factory import fuzzy

from tournesol.models import EntityPollRating, Poll
from tournesol.tests.factories.entity import VideoFactory


class EntityPollRatingFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = EntityPollRating

    poll = factory.LazyAttribute(lambda n: Poll.default_poll())
    entity = factory.SubFactory(VideoFactory)
    tournesol_score = fuzzy.FuzzyDecimal(-10, 10)
