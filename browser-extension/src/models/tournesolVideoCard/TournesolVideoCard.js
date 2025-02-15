/**
 * Convert a duration in seconds to a string representing the time.
 *
 * Ex:
 *
 *  secondsToTime(61)   -> '01:01'
 *  secondsToTime(3600) -> '01:00:00'
 */
const videoDurationToTime = (duration) => {
  const roundToTwoDigits = (number) => {
    return number < 10 ? `0${number}` : `${number}`;
  };
  const hours = Math.floor(duration / 3600);
  const minutes = roundToTwoDigits(Math.floor((duration % 3600) / 60));
  const seconds = roundToTwoDigits(duration % 60);
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
};

export class TournesolVideoCard {
  static makeCard(video, displayCriteria) {
    const videoCard = document.createElement('div');
    videoCard.className = 'video_card';

    const thumbnailDiv = TournesolVideoCard.createThumbnailDiv(video);
    videoCard.append(thumbnailDiv);

    const metadataDiv = TournesolVideoCard.createMetadataDiv(video);

    /**
     * If the content script is executed on the YT research page, add the
     * criteria to the video's details.
     */
    if (displayCriteria) {
      const criteriaDiv = TournesolVideoCard.createVideoCriteria(video);
      metadataDiv.append(criteriaDiv);
    }

    videoCard.append(metadataDiv);
    return videoCard;
  }

  static createVideoCriteria(video) {
    const criteriaDiv = document.createElement('div');
    criteriaDiv.className = 'video_text video_criteria';

    if (video.criteria_scores.length > 1) {
      // Sort the criteria by score (the main criterion is excluded)
      const sortedCriteria = video.criteria_scores
        .filter((criteria) => criteria.criteria != 'largely_recommended')
        .sort((a, b) => a.score - b.score);

      const lowestCriteria = sortedCriteria[0];
      const highestCriteria = sortedCriteria[sortedCriteria.length - 1];

      const lowestCriteriaTitle = `${chrome.i18n.getMessage(
        lowestCriteria.criteria
      )}: ${Math.round(lowestCriteria.score)}`;

      const highestCriteriaTitle = `${chrome.i18n.getMessage(
        highestCriteria.criteria
      )}: ${Math.round(highestCriteria.score)}`;

      const lowestCriteriaIconUrl = `images/criteriaIcons/${lowestCriteria.criteria}.svg`;
      const highestCriteriaIconUrl = `images/criteriaIcons/${highestCriteria.criteria}.svg`;

      if (highestCriteria.score > 0) {
        criteriaDiv.innerHTML += `${chrome.i18n.getMessage(
          'ratedHigh'
        )} <img src=${chrome.runtime.getURL(
          highestCriteriaIconUrl
        )} title='${highestCriteriaTitle}' />`;
      }

      if (lowestCriteria.score < 0) {
        criteriaDiv.innerHTML += `${chrome.i18n.getMessage(
          'ratedLow'
        )} <img src=${chrome.runtime.getURL(
          lowestCriteriaIconUrl
        )} title='${lowestCriteriaTitle}' />`;
      }
    }

    return criteriaDiv;
  }

  static createThumbnailDiv(video) {
    const thumbDiv = document.createElement('div');
    thumbDiv.setAttribute('class', 'thumb_div');

    const thumbnail = document.createElement('img');
    thumbnail.className = 'video_thumb';
    thumbnail.src = `https://img.youtube.com/vi/${video.metadata.video_id}/mqdefault.jpg`;
    thumbDiv.append(thumbnail);

    const duration = document.createElement('p');
    duration.setAttribute('class', 'time_span');
    duration.append(
      document.createTextNode(videoDurationToTime(video.metadata.duration))
    );
    thumbDiv.append(duration);

    const watchLink = document.createElement('a');
    watchLink.className = 'video_link';
    watchLink.href = '/watch?v=' + video.metadata.video_id;
    thumbDiv.append(watchLink);

    return thumbDiv;
  }

  static createMetadataDiv(video) {
    const metadataDiv = document.createElement('div');
    metadataDiv.setAttribute('class', 'details_div');

    const title = document.createElement('h2');
    title.className = 'video_title';

    const titleLink = document.createElement('a');
    titleLink.className = 'video_title_link';
    titleLink.href = '/watch?v=' + video.metadata.video_id;
    titleLink.append(video.metadata.name);

    title.append(titleLink);
    metadataDiv.append(title);

    const channelDiv = document.createElement('div');
    channelDiv.classList.add('video_channel_details');

    const uploader = document.createElement('p');
    uploader.className = 'video_text';

    const channelLink = document.createElement('a');
    channelLink.classList.add('video_channel_link');
    channelLink.textContent = video.metadata.uploader;
    channelLink.href = `https://youtube.com/channel/${video.metadata.channel_id}`;

    uploader.append(channelLink);
    channelDiv.append(uploader);

    const viewsAndDate = document.createElement('p');
    viewsAndDate.className = 'video_text';
    viewsAndDate.innerHTML = `${chrome.i18n.getMessage('views', [
      TournesolVideoCard.millifyViews(video.metadata.views),
    ])} <span class="dot">&nbsp•&nbsp</span> ${TournesolVideoCard.viewPublishedDate(
      video.metadata.publication_date
    )}`;
    channelDiv.append(viewsAndDate);
    metadataDiv.append(channelDiv);

    const scoreAndRatings = document.createElement('p');
    scoreAndRatings.className = 'video_text video_tournesol_rating';
    scoreAndRatings.innerHTML = `<img
          class="tournesol_score_logo"
          src="https://tournesol.app/svg/tournesol.svg"
          alt="Tournesol logo"
        />
          <strong>
            ${video.tournesol_score.toFixed(0)}
            <span class="dot">&nbsp·&nbsp</span>
          </strong>
          <span>${chrome.i18n.getMessage('comparisonsBy', [
            video.n_comparisons,
          ])}</span>&nbsp
          <span class="contributors">
            ${chrome.i18n.getMessage('comparisonsContributors', [
              video.n_contributors,
            ])}
          </span>`;

    metadataDiv.append(scoreAndRatings);
    return metadataDiv;
  }

  /**
   * TODO:
   * - use the resolved browser lang to format the number, instead of `en`
   */
  static millifyViews(videoViews) {
    // Intl.NumberFormat object is in-built and enables language-sensitive number formatting
    return Intl.NumberFormat('en', { notation: 'compact' }).format(videoViews);
  }

  static viewPublishedDate(publishedDate) {
    const date1 = new Date(publishedDate);
    const date2 = new Date();
    // We will find the difference in time of today's date and the published date, and will convert it into Days
    // after calculating no. of days, we classify it into days, weeks, months, years, etc.
    const diffTime = date2.getTime() - date1.getTime();

    if (diffTime < 0) {
      //in case the local machine UTC time is less than the published date
      return '';
    }
    const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

    if (diffDays == 0) {
      return chrome.i18n.getMessage('publishedToday');
    } else if (diffDays == 1) {
      return chrome.i18n.getMessage('publishedYesterday');
    } else if (diffDays < 31) {
      if (diffDays < 14) {
        return chrome.i18n.getMessage('publishedSomeDaysAgo', [diffDays]);
      } else {
        return chrome.i18n.getMessage('publishedSomeWeeksAgo', [
          Math.floor(diffDays / 7),
        ]);
      }
    } else if (diffDays < 365) {
      if (diffDays < 61) {
        return chrome.i18n.getMessage('publishedAMonthAgo');
      } else {
        return chrome.i18n.getMessage('publishedSomeMonthsAgo', [
          Math.floor(diffDays / 30),
        ]);
      }
    } else {
      if (diffDays < 730) {
        return chrome.i18n.getMessage('publishedAYearAgo');
      } else {
        return chrome.i18n.getMessage('publishedSomeYearsAgo', [
          Math.floor(diffDays / 365),
        ]);
      }
    }
  }
}
